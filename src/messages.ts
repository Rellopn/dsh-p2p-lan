/** Pure message model for LAN P2P collaboration. No runtime dependencies. @module @rellopn/dsh-p2p-lan */

/** Maximum encoded bytes for one message body. */
export const MAX_BODY_BYTES = 64 * 1024
/** Maximum bytes for one attachment. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024
/** Maximum auto-reply chain depth before forcing human review. */
export const MAX_REPLY_DEPTH = 3

/** Blocklist of clearly-executable attachment extensions (source files stay shareable). */
export const EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.exe', '.com', '.scr', '.bat', '.cmd', '.msi', '.pif',
  '.dll', '.sys', '.so', '.dylib',
  '.ps1', '.psm1', '.vbs', '.jar', '.apk',
])

import type { Envelope } from './types.ts'

// Wire types live in ./types.ts (type-only, shared by both compiler faces);
// re-exported here so existing host/test consumers keep their import site.
export type {
  Address,
  AttachmentRef,
  Envelope,
  EnvelopeKind,
  PeerRef,
} from './types.ts'

/** Result of validating an envelope. */
export type ValidationResult = { ok: true } | { ok: false; errors: string[] }

/** Return true when a filename's extension is on the executable blocklist. */
export function isExecutableFilename(filename: string): boolean {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return false
  return EXECUTABLE_EXTENSIONS.has(filename.slice(dot).toLowerCase())
}

/** UTF-8 byte length of a string. */
export function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

function fail(errors: string[]): ValidationResult {
  return { ok: false, errors }
}

/** Validate one envelope; returns structured errors rather than throwing. */
export function validateEnvelope(input: unknown): ValidationResult {
  const errors: string[] = []
  if (typeof input !== 'object' || input === null) return fail(['envelope must be an object'])
  const env = input as Record<string, unknown>

  if (typeof env.id !== 'string' || env.id.length === 0) errors.push('id must be a non-empty string')
  if (env.kind !== 'request' && env.kind !== 'reply' && env.kind !== 'event') errors.push('kind must be request|reply|event')

  const from = env.from as Record<string, unknown> | undefined
  if (typeof from !== 'object' || from === null) {
    errors.push('from must be a peer ref')
  } else {
    if (typeof from.id !== 'string' || from.id.length === 0) errors.push('from.id must be a non-empty string')
    if (typeof from.name !== 'string' || from.name.length === 0) errors.push('from.name must be a non-empty string')
  }

  const to = env.to as Record<string, unknown> | undefined
  if (typeof to !== 'object' || to === null) {
    errors.push('to must be an address')
  } else {
    const hasKey = typeof to.id === 'string' || typeof to.name === 'string'
      || typeof to.capability === 'string' || typeof to.group === 'string'
    if (!hasKey && to.broadcast !== true) errors.push('to must specify at least one of id/name/capability/group/broadcast')
  }

  if (typeof env.body !== 'string') {
    errors.push('body must be a string')
  } else if (byteLength(env.body) > MAX_BODY_BYTES) {
    errors.push(`body exceeds ${MAX_BODY_BYTES} bytes`)
  }

  if (env.attachment !== undefined) {
    const att = env.attachment as Record<string, unknown>
    if (typeof att !== 'object' || att === null) {
      errors.push('attachment must be an object')
    } else {
      if (typeof att.filename !== 'string' || att.filename.length === 0) errors.push('attachment.filename required')
      else if (isExecutableFilename(att.filename)) errors.push('attachment is an executable file')
      if (typeof att.size !== 'number' || att.size < 0) errors.push('attachment.size must be a non-negative number')
      else if (att.size > MAX_ATTACHMENT_BYTES) errors.push(`attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`)
      if (typeof att.hash !== 'string' || att.hash.length === 0) errors.push('attachment.hash required')
      if (typeof att.ref !== 'string' || att.ref.length === 0) errors.push('attachment.ref required')
    }
  }

  if (env.ts !== undefined && (typeof env.ts !== 'number' || !Number.isFinite(env.ts))) errors.push('ts must be a finite number')
  if (env.depth !== undefined && (typeof env.depth !== 'number' || !Number.isInteger(env.depth) || env.depth < 0)) errors.push('depth must be a non-negative integer')

  return errors.length === 0 ? { ok: true } : fail(errors)
}

/** Serialize an envelope to a stable JSON string. */
export function serializeEnvelope(envelope: Envelope): string {
  return JSON.stringify(envelope)
}

/** Parse and validate an envelope from JSON; throws when invalid. */
export function deserializeEnvelope(json: string): Envelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('invalid JSON envelope')
  }
  const result = validateEnvelope(parsed)
  if (!result.ok) throw new Error(`invalid envelope: ${result.errors.join('; ')}`)
  return parsed as Envelope
}

/** Return a dedupe predicate keyed by envelope id. */
export function createDedupe(): (id: string) => boolean {
  const seen = new Set<string>()
  return (id: string): boolean => {
    if (seen.has(id)) return true
    seen.add(id)
    return false
  }
}
