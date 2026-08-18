/** LAN peer discovery: UDP multicast beacon, manual peers, capability index, name-conflict detection. @module @rellopn/dsh-p2p-lan */

import { createSocket, type Socket } from 'node:dgram'
import { EventEmitter } from 'node:events'
import { networkInterfaces } from 'node:os'
import type { ManualPeer, ProjectEntry } from './config.ts'
import type { NodeIdentity } from './identity.ts'
import type { PeerInfo } from './types.ts'

// Wire type lives in ./types.ts (type-only); re-exported for host/test import sites.
export type { PeerInfo } from './types.ts'

/** The multicast announce payload. */
export interface AnnouncePayload {
  type: 'announce'
  id: string
  name: string
  capabilities: string[]
  /** Project names this node chose to broadcast (never paths). */
  projects: string[]
  host: string
  port: number
}

/** Discovery tuning knobs. */
export interface DiscoveryOptions {
  identity: NodeIdentity
  capabilities: string[]
  host: string
  /** Our own transport port, advertised to peers. */
  port: number
  autoDiscover: boolean
  manualPeers: ManualPeer[]
  /** Local project table; only `broadcast: true` names are announced. */
  projects?: ProjectEntry[]
  multicastAddress?: string
  multicastPort?: number
  announceIntervalMs?: number
  peerTtlMs?: number
  sweepIntervalMs?: number
}

export const DEFAULT_MULTICAST_ADDRESS = '239.255.42.99'
export const DEFAULT_MULTICAST_PORT = 53099
export const DEFAULT_ANNOUNCE_INTERVAL_MS = 1000
export const DEFAULT_PEER_TTL_MS = 3500
export const DEFAULT_SWEEP_INTERVAL_MS = 500

/** Best-effort first non-internal IPv4 address; tests pass `host` explicitly. */
export function detectLanAddress(): string | undefined {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return undefined
}

/** Directory of currently-known peers, keyed by id. */
export class Discovery extends EventEmitter {
  private readonly identity: NodeIdentity
  private capabilities: string[]
  private host: string
  private port: number
  private readonly autoDiscover: boolean
  private readonly manualPeers: ManualPeer[]
  private projects: string[]
  private readonly multicastAddress: string
  private readonly multicastPort: number
  private readonly announceIntervalMs: number
  private readonly peerTtlMs: number
  private readonly sweepIntervalMs: number

  private readonly directory = new Map<string, PeerInfo>()
  private readonly conflicting = new Set<string>()
  private socket: Socket | undefined
  private announceTimer: ReturnType<typeof setInterval> | undefined
  private sweepTimer: ReturnType<typeof setInterval> | undefined

  constructor(options: DiscoveryOptions) {
    super()
    this.identity = options.identity
    this.capabilities = options.capabilities
    this.host = options.host
    this.port = options.port
    this.autoDiscover = options.autoDiscover
    this.manualPeers = options.manualPeers
    this.projects = (options.projects ?? []).filter(entry => entry.broadcast).map(entry => entry.name)
    this.multicastAddress = options.multicastAddress ?? DEFAULT_MULTICAST_ADDRESS
    this.multicastPort = options.multicastPort ?? DEFAULT_MULTICAST_PORT
    this.announceIntervalMs = options.announceIntervalMs ?? DEFAULT_ANNOUNCE_INTERVAL_MS
    this.peerTtlMs = options.peerTtlMs ?? DEFAULT_PEER_TTL_MS
    this.sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
  }

  /** Start advertising and listening. Idempotent. */
  start(): void {
    this.setManualPeers(this.manualPeers)
    if (!this.autoDiscover) return

    this.socket = createSocket({ type: 'udp4', reuseAddr: true })
    this.socket.on('error', err => this.emit('error', err))
    this.socket.on('message', data => this.handleMessage(data))
    this.socket.bind(this.multicastPort, () => {
      this.socket?.setMulticastTTL(1)
      try {
        this.socket?.addMembership(this.multicastAddress)
      } catch (err) {
        this.emit('error', err)
      }
      this.announce()
    })
    this.announceTimer = setInterval(() => this.announce(), this.announceIntervalMs)
    this.sweepTimer = setInterval(() => this.sweep(), this.sweepIntervalMs)
  }

  /** Stop advertising/listening and release resources. Idempotent. */
  stop(): void {
    if (this.announceTimer !== undefined) clearInterval(this.announceTimer)
    if (this.sweepTimer !== undefined) clearInterval(this.sweepTimer)
    this.announceTimer = undefined
    this.sweepTimer = undefined
    this.socket?.close()
    this.socket = undefined
    this.directory.clear()
  }

  /** Snapshot of known peers (excluding self). */
  peers(): PeerInfo[] {
    return [...this.directory.values()]
  }

  /** Replace the announced project names (used by live settings edits). */
  setProjects(names: string[]): void {
    this.projects = names
  }

  /**
   * Point the advertise payload at the port the transport actually bound
   * (auto-selected when the requested port was busy). Must be called before
   * {@link start} so peers immediately learn the real address.
   */
  setAdvertisedPort(port: number): void {
    this.port = port
  }

  /**
   * Override the host peers are told to connect to (e.g. a WSL node behind a
   * Windows port-forward should advertise the Windows host's LAN IP). Used by
   * live settings edits; no restart needed.
   */
  setAdvertisedHost(host: string): void {
    this.host = host
  }

  /** Replace the announced capability tags (used by live settings edits). */
  setCapabilities(capabilities: string[]): void {
    this.capabilities = capabilities
  }

  /**
   * Reconcile the manual-peer directory with a new list (live settings edits):
   * drop manual entries no longer listed, then upsert the rest (adds new ones,
   * refreshes host/port for ones that moved).
   */
  setManualPeers(peers: ManualPeer[]): void {
    const nextNames = new Set(peers.map(peer => peer.name))
    for (const [id, peer] of this.directory) {
      if (peer.manual && !nextNames.has(peer.name)) this.directory.delete(id)
    }
    for (const manual of peers) {
      this.upsert({
        id: `manual:${manual.name}`,
        name: manual.name,
        capabilities: [],
        projects: [],
        host: manual.host,
        port: manual.port,
        lastSeen: Date.now(),
        manual: true,
      })
    }
  }

  resolveById(id: string): PeerInfo | undefined {
    return this.directory.get(id)
  }

  resolveByName(name: string): PeerInfo | undefined {
    for (const peer of this.directory.values()) {
      if (peer.name === name) return peer
    }
    return undefined
  }

  resolveByCapability(capability: string): PeerInfo[] {
    const result: PeerInfo[] = []
    for (const peer of this.directory.values()) {
      if (peer.capabilities.includes(capability)) result.push(peer)
    }
    return result
  }

  /** True when a peer with this id is in name-conflict (rejected). */
  hasNameConflict(id: string): boolean {
    return this.conflicting.has(id)
  }

  private announce(): void {
    if (this.socket === undefined) return
    const payload: AnnouncePayload = {
      type: 'announce',
      id: this.identity.id,
      name: this.identity.name,
      capabilities: this.capabilities,
      projects: this.projects,
      host: this.host,
      port: this.port,
    }
    const data = Buffer.from(JSON.stringify(payload), 'utf8')
    this.socket.send(data, 0, data.length, this.multicastPort, this.multicastAddress, (err) => {
      if (err) this.emit('error', err)
    })
  }

  private handleMessage(data: Buffer): void {
    let payload: unknown
    try {
      payload = JSON.parse(data.toString('utf8'))
    } catch {
      return
    }
    if (typeof payload !== 'object' || payload === null) return
    const announce = payload as Partial<AnnouncePayload>
    if (announce.type !== 'announce') return
    if (typeof announce.id !== 'string' || typeof announce.name !== 'string') return
    if (announce.id === this.identity.id) return

    if (announce.name === this.identity.name) {
      this.conflicting.add(announce.id)
      this.emit('name-conflict', announce)
      return
    }

    this.upsert({
      id: announce.id,
      name: announce.name,
      capabilities: Array.isArray(announce.capabilities) ? announce.capabilities.filter((c): c is string => typeof c === 'string') : [],
      projects: Array.isArray(announce.projects) ? announce.projects.filter((p): p is string => typeof p === 'string') : [],
      host: typeof announce.host === 'string' ? announce.host : '',
      port: typeof announce.port === 'number' ? announce.port : 0,
      lastSeen: Date.now(),
      manual: false,
    })
  }

  private sweep(): void {
    const now = Date.now()
    for (const [id, peer] of this.directory) {
      if (peer.manual) continue
      if (now - peer.lastSeen > this.peerTtlMs) {
        this.directory.delete(id)
        this.emit('peer-offline', peer)
      }
    }
  }

  /** Add or refresh a peer; returns true when newly added. */
  private upsert(peer: PeerInfo): boolean {
    const existing = this.directory.get(peer.id)
    this.directory.set(peer.id, peer)
    if (existing === undefined) {
      this.emit('peer-online', peer)
      return true
    }
    return false
  }
}
