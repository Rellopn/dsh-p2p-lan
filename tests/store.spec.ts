import { describe, expect, it } from 'vitest'
import type { Envelope } from '../src/messages.ts'
import type { PeerAddress } from '../src/transport.ts'
import { Store, type TransportLike } from '../src/store.ts'

function envelope(id: string, from = 'peer-b'): Envelope {
  return {
    id,
    kind: 'request',
    from: { id: from, name: from },
    to: { name: 'node-A' },
    body: 'hello',
    ts: Date.now(),
  }
}

const peer: PeerAddress = { host: '127.0.0.1', port: 12000 }

function okTransport(): TransportLike {
  return { send: async () => {} }
}

function failTransport(): TransportLike {
  return { send: async () => { throw new Error('down') } }
}

describe('store outbox / dead letter', () => {
  it('send succeeds without queuing', async () => {
    const store = new Store(okTransport())
    const result = await store.send(peer, envelope('e1'))
    expect(result).toBe('delivered')
    expect(store.outboxSnapshot()).toHaveLength(0)
  })

  it('send failure queues, flush retries, then dead-letters after max attempts', async () => {
    const store = new Store(failTransport(), { maxSendAttempts: 2 })
    const failed: string[] = []
    store.on('send-failed', (env: Envelope) => failed.push(env.id))

    const result = await store.send(peer, envelope('e1'))
    expect(result).toBe('queued')
    expect(store.outboxSnapshot()).toHaveLength(1)

    // Attempt 1 → still queued (attempts 0 → 1)
    await store.flush()
    expect(store.outboxSnapshot()).toHaveLength(1)
    expect(store.deadLetterSnapshot()).toHaveLength(0)

    // Attempt 2 → dead letter
    await store.flush()
    expect(store.outboxSnapshot()).toHaveLength(0)
    expect(store.deadLetterSnapshot()).toHaveLength(1)
    expect(failed).toEqual(['e1'])
  })

  it('flush delivers queued entries once the transport recovers', async () => {
    let down = true
    const flaky: TransportLike = {
      send: async () => {
        if (down) throw new Error('down')
      },
    }
    const store = new Store(flaky)
    await store.send(peer, envelope('e1'))
    expect(store.outboxSnapshot()).toHaveLength(1)

    down = false
    await store.flush()
    expect(store.outboxSnapshot()).toHaveLength(0)
    expect(store.deadLetterSnapshot()).toHaveLength(0)
  })
})

describe('store inbox read tracking', () => {
  it('checkInbox marks aiRead but keeps human unread', () => {
    const store = new Store(okTransport())
    store.deliverInbound(envelope('m1'))
    store.deliverInbound(envelope('m2'))

    expect(store.humanUnreadCount()).toBe(2)
    const seen = store.checkInbox()
    expect(seen.map(e => e.id)).toEqual(['m1', 'm2'])
    expect(store.humanUnreadCount()).toBe(2) // AI read does not clear human badge

    expect(store.checkInbox()).toHaveLength(0) // already aiRead
  })

  it('markThreadRead clears human unread for one peer only', () => {
    const store = new Store(okTransport())
    store.deliverInbound(envelope('m1', 'peer-b'))
    store.deliverInbound(envelope('m2', 'peer-c'))

    store.markThreadRead('peer-b')
    expect(store.humanUnreadCount('peer-b')).toBe(0)
    expect(store.humanUnreadCount('peer-c')).toBe(1)
    expect(store.humanUnreadCount()).toBe(1)
  })
})
