import { describe, expect, it } from 'vitest'
import type { Envelope } from '../src/messages.ts'
import { createIdentity, sign, verify } from '../src/identity.ts'

describe('identity', () => {
  it('creates identity with an explicit id', () => {
    expect(createIdentity('node-A', 'id-a')).toEqual({ id: 'id-a', name: 'node-A' })
  })

  it('generates an id when omitted', () => {
    const identity = createIdentity('node-A')
    expect(identity.id.length).toBeGreaterThan(0)
    expect(identity.name).toBe('node-A')
  })

  it('rejects an empty name', () => {
    expect(() => createIdentity('')).toThrow()
  })

  it('sign is identity and verify trusts all (model A)', () => {
    const envelope = {} as Envelope
    expect(sign(envelope)).toBe(envelope)
    expect(verify(envelope)).toBe(true)
  })
})
