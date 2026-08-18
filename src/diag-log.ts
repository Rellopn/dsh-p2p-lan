/**
 * Tiny file logger for p2p-lan diagnostics. Independent of the host logger
 * (dsh web may not surface Cordis logs on stdout), so runtime routing/gate
 * decisions can be inspected by tailing ~/.dsh/p2p-lan.log. Diagnostics must
 * never break the node: every failure is swallowed.
 * @module @rellopn/dsh-p2p-lan
 */

import { appendFileSync, mkdirSync, truncateSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

let logPath: string | undefined
let opened = false

function resolvePath(): string {
  if (logPath !== undefined) return logPath
  logPath = process.env.P2P_DIAG_LOG ?? join(homedir(), '.dsh', 'p2p-lan.log')
  return logPath
}

/** Truncate the diagnostic log when the node (re)starts. */
export function openDiagLog(): void {
  if (opened) return
  opened = true
  try {
    const path = resolvePath()
    mkdirSync(dirname(path), { recursive: true })
    truncateSync(path, 0)
  } catch {
    // Diagnostics must never break the node.
  }
}

/** Append one line to the diagnostic log. */
export function appendDiagLog(level: 'info' | 'warn' | 'error', message: string): void {
  try {
    appendFileSync(resolvePath(), `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}\n`, 'utf8')
  } catch {
    // Diagnostics must never break the node.
  }
}
