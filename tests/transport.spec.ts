import { describe, expect, it } from 'vitest'
import type { Envelope } from '../src/messages.ts'
import { Transport } from '../src/transport.ts'

function envelope(id: string): Envelope {
  return {
    id,
    kind: 'request',
    from: { id: 'a', name: 'node-A' },
    to: { name: 'node-B' },
    body: 'hello',
    ts: Date.now(),
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('waitFor timed out')
}

describe('transport', () => {
  it('delivers an envelope and receives its ack', async () => {
    const a = new Transport({ port: 11001 })
    const b = new Transport({ port: 11002 })
    a.start()
    b.start()
    try {
      const received: Envelope[] = []
      b.on('envelope', env => received.push(env))
      await a.send({ host: '127.0.0.1', port: 11002 }, envelope('e1'))
      await waitFor(() => received.length === 1)
      expect(received[0]?.id).toBe('e1')
    } finally {
      await a.stop()
      await b.stop()
    }
  })

  it('dedupes repeated envelopes but still acks them', async () => {
    const a = new Transport({ port: 11003 })
    const b = new Transport({ port: 11004 })
    a.start()
    b.start()
    try {
      const received: Envelope[] = []
      b.on('envelope', env => received.push(env))
      await a.send({ host: '127.0.0.1', port: 11004 }, envelope('dup'))
      await a.send({ host: '127.0.0.1', port: 11004 }, envelope('dup'))
      await waitFor(() => received.length === 1)
      await sleep(100)
      expect(received.length).toBe(1)
    } finally {
      await a.stop()
      await b.stop()
    }
  })

  it('is bidirectional (reply over the reverse direction)', async () => {
    const a = new Transport({ port: 11005 })
    const b = new Transport({ port: 11006 })
    a.start()
    b.start()
    try {
      const atA: Envelope[] = []
      const atB: Envelope[] = []
      a.on('envelope', env => atA.push(env))
      b.on('envelope', env => atB.push(env))
      await a.send({ host: '127.0.0.1', port: 11006 }, envelope('q1'))
      await b.send({ host: '127.0.0.1', port: 11005 }, envelope('r1'))
      await waitFor(() => atB.length === 1 && atA.length === 1)
      expect(atB[0]?.id).toBe('q1')
      expect(atA[0]?.id).toBe('r1')
    } finally {
      await a.stop()
      await b.stop()
    }
  })
})

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
