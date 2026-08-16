/** Node configuration schema and defaults. @module @rellopn/dsh-p2p-lan */

import { basename, isAbsolute } from 'node:path'
import type { ManualPeer, ProjectEntry, Sensitivity } from './types.ts'

// Wire types live in ./types.ts (type-only); re-exported for host/test import sites.
export type { ManualPeer, ProjectEntry, Sensitivity } from './types.ts'

/**
 * Project name shape: any non-empty run of non-whitespace, non-path-separator,
 * non-control characters. CJK and other non-ASCII letters are preserved (a
 * directory named 羽毛球 stays 羽毛球); spaces, `/`, `\`, and control chars are
 * rejected so a name is never mistaken for a path or broken in JSON/logs.
 */
const PROJECT_NAME = /^[^\s/\\\u0000-\u0008\u000e-\u001f]+$/

/** P2P collaboration configuration. */
export interface Config {
  nodeName: string
  capabilities: string[]
  autoDiscover: boolean
  manualPeers: ManualPeer[]
  port: number
  groupTable: Record<string, string[]>
  sensitivity: Sensitivity
  sendWaitTimeoutMs: number
  projects: ProjectEntry[]
}

/** Default wait for a synchronous reply. */
export const DEFAULT_SEND_WAIT_TIMEOUT_MS = 5 * 60 * 1000
/** Default WebSocket listen port. */
export const DEFAULT_PORT = 53420

/** Default configuration. */
export const defaultConfig: Config = {
  nodeName: 'unnamed',
  capabilities: [],
  autoDiscover: true,
  manualPeers: [],
  port: DEFAULT_PORT,
  groupTable: {},
  sensitivity: 'standard',
  sendWaitTimeoutMs: DEFAULT_SEND_WAIT_TIMEOUT_MS,
  projects: [],
}

/**
 * Normalize and validate the project table: `broadcast` defaults to `false`,
 * names must be non-empty, free of whitespace/slashes/control chars, and
 * node-local unique; paths must be absolute.
 * @param input - raw project list (may omit `broadcast`).
 * @returns the validated project list with `broadcast` coerced to boolean.
 */
export function normalizeProjects(input: readonly ProjectEntry[] | undefined): ProjectEntry[] {
  const seen = new Set<string>()
  return (input ?? []).map((entry) => {
    if (!PROJECT_NAME.test(entry.name)) {
      throw new Error(`p2p-lan: project name ${JSON.stringify(entry.name)} must be non-empty and free of whitespace, slashes, and control characters`)
    }
    if (seen.has(entry.name)) {
      throw new Error(`p2p-lan: duplicate project name ${JSON.stringify(entry.name)}`)
    }
    seen.add(entry.name)
    if (!isAbsolute(entry.path)) {
      throw new Error(`p2p-lan: project ${JSON.stringify(entry.name)} path must be absolute: ${entry.path}`)
    }
    return { name: entry.name, path: entry.path, broadcast: entry.broadcast === true }
  })
}

/**
 * Lenient project-table filter for live settings edits: keep every entry the
 * node can actually act on (valid name, node-local unique, absolute path) and
 * silently drop the rest. Unlike {@link normalizeProjects} this never throws,
 * so an in-progress row the user has not finished typing (empty name, relative
 * path) can still be persisted and shown without breaking discovery or the
 * project-task lookup.
 * @param input - raw project list from the settings layer.
 * @returns the actionable subset with `broadcast` coerced to boolean.
 */
export function validProjects(input: readonly ProjectEntry[] | undefined): ProjectEntry[] {
  const seen = new Set<string>()
  const out: ProjectEntry[] = []
  for (const entry of input ?? []) {
    if (!PROJECT_NAME.test(entry.name)) continue
    if (seen.has(entry.name)) continue
    if (!isAbsolute(entry.path)) continue
    seen.add(entry.name)
    out.push({ name: entry.name, path: entry.path, broadcast: entry.broadcast === true })
  }
  return out
}

/** One workspace-shaped entry the importer consumes (structural, no workspace dep). */
export interface WorkspaceLike {
  path: string
  title: string
}

/**
 * Normalize a title/path into a project name: lowercase ASCII, fold every run
 * of non-letter/non-number characters into a single hyphen, and trim stray
 * hyphens. Unicode letters (CJK included) are preserved, so 羽毛球 stays
 * 羽毛球 while Backend API becomes backend-api. May return `''` only when the
 * value holds no letter or number at all.
 */
export function slugify(value: string): string {
  return value.trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Derive a P2P project name for one workspace: the title (normalized), then the
 * path basename (normalized), then `project-<n>` as a last resort. The result
 * always satisfies the {@link PROJECT_NAME} name shape.
 */
export function deriveProjectName(title: string, path: string, index: number): string {
  const fromTitle = slugify(title)
  if (PROJECT_NAME.test(fromTitle)) return fromTitle
  const fromBase = slugify(basename(path))
  if (PROJECT_NAME.test(fromBase)) return fromBase
  return `project-${index + 1}`
}

/**
 * Merge workspaces into the project table: skip paths already present (idempotent),
 * derive names (collision-suffixed with `-2`/`-3`), and default new entries to
 * broadcast off. Returns a fresh list with the imported entries appended.
 */
export function mergeWorkspaces(
  current: readonly ProjectEntry[],
  workspaces: readonly WorkspaceLike[],
): ProjectEntry[] {
  const merged: ProjectEntry[] = [...current]
  const paths = new Set(current.map(entry => entry.path))
  const names = new Set(current.map(entry => entry.name))
  let added = 0
  for (const workspace of workspaces) {
    if (paths.has(workspace.path)) continue
    const base = deriveProjectName(workspace.title, workspace.path, added)
    let name = base
    let suffix = 2
    while (names.has(name)) {
      name = `${base}-${suffix}`
      suffix += 1
    }
    merged.push({ name, path: workspace.path, broadcast: false })
    paths.add(workspace.path)
    names.add(name)
    added += 1
  }
  return merged
}

/** Merge partial user config over defaults, normalizing the project table. */
export function resolveConfig(partial: Partial<Config> = {}): Config {
  return { ...defaultConfig, ...partial, projects: normalizeProjects(partial.projects) }
}
