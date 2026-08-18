import { describe, expect, it } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  MAX_BODY_BYTES,
  createDedupe,
  deserializeEnvelope,
  isExecutableFilename,
  serializeEnvelope,
  validateEnvelope,
  type Envelope,
} from '../src/messages.ts'

function valid(): Envelope {
  return {
    id: 'e1',
    kind: 'request',
    from: { id: 'a', name: 'node-A' },
    to: { name: 'node-B' },
    body: 'hello',
    ts: Date.now(),
  }
}

describe('messages model', () => {
  it('accepts a valid envelope', () => {
    expect(validateEnvelope(valid())).toEqual({ ok: true })
  })

  it('accepts an envelope whose from carries host/port', () => {
    const e = { ...valid(), from: { id: 'a', name: 'node-A', host: '10.0.0.8', port: 53420 } }
    expect(validateEnvelope(e)).toEqual({ ok: true })
  })

  it('rejects a malformed from.host or from.port', () => {
    expect(validateEnvelope({ ...valid(), from: { id: 'a', name: 'node-A', host: 123 } }).ok).toBe(false)
    expect(validateEnvelope({ ...valid(), from: { id: 'a', name: 'node-A', port: '53420' } }).ok).toBe(false)
  })

  it('rejects an empty id', () => {
    const e: Record<string, unknown> = { ...valid(), id: '' }
    const result = validateEnvelope(e)
    expect(result.ok).toBe(false)
  })

  it('rejects a body over the byte limit', () => {
    const e = { ...valid(), body: 'x'.repeat(MAX_BODY_BYTES + 1) }
    const result = validateEnvelope(e)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toContain('body exceeds')
  })

  it('rejects an executable attachment', () => {
    expect(isExecutableFilename('evil.exe')).toBe(true)
    expect(isExecutableFilename('notes.pdf')).toBe(false)
    const e = { ...valid(), attachment: { filename: 'evil.exe', size: 10, hash: 'h', ref: 'r' } }
    const result = validateEnvelope(e)
    expect(result.ok).toBe(false)
  })

  it('rejects an oversized attachment', () => {
    const e = { ...valid(), attachment: { filename: 'big.bin', size: MAX_ATTACHMENT_BYTES + 1, hash: 'h', ref: 'r' } }
    expect(validateEnvelope(e).ok).toBe(false)
  })

  it('round-trips serialize/deserialize', () => {
    const envelope = valid()
    expect(deserializeEnvelope(serializeEnvelope(envelope)).id).toBe('e1')
  })

  it('dedupe flags repeats', () => {
    const seen = createDedupe()
    expect(seen('e1')).toBe(false)
    expect(seen('e1')).toBe(true)
  })
})
