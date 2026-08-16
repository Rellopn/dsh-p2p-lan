import { describe, expect, it } from 'vitest'
import { Discovery, type DiscoveryOptions } from '../src/discovery.ts'

const MCAST_ADDR = '239.255.42.98'
const MCAST_PORT = 53101

function makeOptions(name: string, id: string, capabilities: string[], port: number, manualPeers: DiscoveryOptions['manualPeers'] = []): DiscoveryOptions {
  return {
    identity: { id, name },
    capabilities,
    host: '127.0.0.1',
    port,
    autoDiscover: true,
    manualPeers,
    multicastAddress: MCAST_ADDR,
    multicastPort: MCAST_PORT,
    announceIntervalMs: 50,
    peerTtlMs: 200,
    sweepIntervalMs: 50,
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('waitFor timed out')
}

describe('discovery', () => {
  it('discovers a peer and resolves by name and capability', async () => {
    const a = new Discovery(makeOptions('node-A', 'a', ['rpc'], 10001))
    const b = new Discovery(makeOptions('node-B', 'b', ['export'], 10002))
    a.start()
    b.start()
    try {
      await waitFor(() => a.resolveByName('node-B') !== undefined)
      await waitFor(() => b.resolveByName('node-A') !== undefined)

      expect(a.resolveByCapability('export').map(p => p.name)).toContain('node-B')
      expect(b.resolveByCapability('rpc').map(p => p.name)).toContain('node-A')
      expect(a.peers().map(p => p.name)).toContain('node-B')
      expect(a.peers().map(p => p.name)).not.toContain('node-A')
    } finally {
      a.stop()
      b.stop()
    }
  })

  it('emits name-conflict on duplicate name and rejects the peer', async () => {
    const a = new Discovery(makeOptions('node-A', 'a', [], 10001))
    const c = new Discovery(makeOptions('node-A', 'c', [], 10003))
    let conflict = false
    a.on('name-conflict', () => {
      conflict = true
    })
    a.start()
    c.start()
    try {
      await waitFor(() => conflict)
      expect(a.hasNameConflict('c')).toBe(true)
      expect(a.resolveById('c')).toBeUndefined()
    } finally {
      a.stop()
      c.stop()
    }
  })

  it('emits peer-offline after a peer stops announcing', async () => {
    const a = new Discovery(makeOptions('node-A', 'a', [], 10001))
    const b = new Discovery(makeOptions('node-B', 'b', [], 10002))
    let offline = false
    a.on('peer-offline', (peer) => {
      if (peer.name === 'node-B') offline = true
    })
    a.start()
    b.start()
    try {
      await waitFor(() => a.resolveByName('node-B') !== undefined)
      b.stop()
      await waitFor(() => offline)
      expect(a.resolveByName('node-B')).toBeUndefined()
    } finally {
      a.stop()
      b.stop()
    }
  })

  it('includes manual peers in the directory', () => {
    const a = new Discovery(makeOptions('node-A', 'a', [], 10001, [{ name: 'node-M', host: '127.0.0.1', port: 10099 }]))
    a.start()
    try {
      const manual = a.resolveByName('node-M')
      expect(manual?.manual).toBe(true)
      expect(manual?.port).toBe(10099)
    } finally {
      a.stop()
    }
  })
})
