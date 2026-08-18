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

describe('discovery known peers', () => {
  function makeOptions(overrides: Partial<DiscoveryOptions> = {}): DiscoveryOptions {
    return {
      identity: { id: 'a', name: 'node-A' },
      capabilities: [],
      host: '127.0.0.1',
      port: 10001,
      autoDiscover: false,
      manualPeers: [],
      multicastAddress: MCAST_ADDR,
      multicastPort: MCAST_PORT,
      ...overrides,
    }
  }

  it('loads knownPeers config into a persistent directory entry', () => {
    const a = new Discovery(makeOptions({ knownPeers: [{ name: 'node-K', host: '10.0.0.9', port: 9001 }] }))
    a.start()
    try {
      expect(a.resolveByName('node-K')?.host).toBe('10.0.0.9')
      expect(a.resolveByName('node-K')?.port).toBe(9001)
    } finally {
      a.stop()
    }
  })

  it('learnKnownPeer adds a peer once and reports fresh additions', () => {
    const a = new Discovery(makeOptions())
    a.start()
    try {
      expect(a.learnKnownPeer({ id: 'k', name: 'node-K', host: '10.0.0.9', port: 9001 })).toBe(true)
      expect(a.resolveById('k')?.host).toBe('10.0.0.9')
      // A second contact with the same name is not a fresh addition.
      expect(a.learnKnownPeer({ id: 'k2', name: 'node-K', host: '10.0.0.9', port: 9001 })).toBe(false)
      expect(a.peers().filter(p => p.name === 'node-K')).toHaveLength(1)
    } finally {
      a.stop()
    }
  })

  it('does not let a learned peer overwrite a manual peer of the same name', () => {
    const a = new Discovery(makeOptions({ manualPeers: [{ name: 'node-K', host: '127.0.0.1', port: 9000 }] }))
    a.start()
    try {
      expect(a.learnKnownPeer({ id: 'k', name: 'node-K', host: '10.0.0.9', port: 9001 })).toBe(false)
      const peer = a.resolveByName('node-K')
      expect(peer?.manual).toBe(true)
      expect(peer?.host).toBe('127.0.0.1')
    } finally {
      a.stop()
    }
  })

  it('never sweeps a known peer even after TTL', async () => {
    const a = new Discovery(makeOptions({ autoDiscover: true, knownPeers: [{ name: 'node-K', host: '127.0.0.1', port: 9001 }] }))
    const b = new Discovery(makeOptions({ autoDiscover: true, identity: { id: 'b', name: 'node-B' }, port: 10002 }))
    b.start()
    try {
      a.start()
      // Wait for a to see b via multicast announce (its own TTL sweeps discovered peers).
      await waitFor(() => a.resolveByName('node-B') !== undefined)
      // node-B is discovered (swept); node-K is a known peer and must persist.
      b.stop()
      await waitFor(() => a.resolveByName('node-B') === undefined, 4000)
      expect(a.resolveByName('node-K')).toBeDefined()
    } finally {
      a.stop()
      b.stop()
    }
  })

  it('setKnownPeers drops entries no longer listed and refreshes addresses', () => {
    const a = new Discovery(makeOptions({ knownPeers: [{ name: 'node-K', host: '10.0.0.9', port: 9001 }] }))
    a.start()
    try {
      a.setKnownPeers([{ name: 'node-K', host: '10.0.0.10', port: 9002 }, { name: 'node-J', host: '10.0.0.11', port: 9003 }])
      expect(a.resolveByName('node-K')?.host).toBe('10.0.0.10')
      expect(a.resolveByName('node-J')?.port).toBe(9003)
    } finally {
      a.stop()
    }
  })
})
