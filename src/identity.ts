/** Node identity and the (currently empty) trust seam. @module @rellopn/dsh-p2p-lan */

import { randomUUID } from 'node:crypto'
import type { Envelope } from './messages.ts'

/** A node's stable identity. */
export interface NodeIdentity {
  id: string
  name: string
}

/** Create a node identity; id defaults to a random UUID. */
export function createIdentity(name: string, id: string = randomUUID()): NodeIdentity {
  if (name.length === 0) throw new Error('node name must be non-empty')
  return { id, name }
}

/** Sign an envelope. Placeholder: returns the envelope unchanged (trust model A). */
export function sign(envelope: Envelope): Envelope {
  return envelope
}

/** Verify an envelope. Placeholder: trusts everything (trust model A). */
export function verify(_envelope: Envelope): boolean {
  return true
}
