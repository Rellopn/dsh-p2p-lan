/**
 * Pure wire types of the P2P domain: the one home of the payload vocabulary
 * shared across the Host plugin, the generated Typert Remote face, and the
 * browser gate panel. This module is type-only and imports nothing, so both
 * compiler faces (host `tsconfig.host.json`, client `tsconfig.client.json`)
 * admit it into their programs without dragging node-only implementation.
 * @module @rellopn/dsh-p2p-lan/types
 */

/** A peer's stable id plus human-readable name. */
export interface PeerRef {
  id: string
  name: string
  /** Sender's reachable advertised address (used for automatic peer pairing). */
  host?: string
  port?: number
}

/** How a message is addressed; at least one routing key is required. */
export interface Address {
  id?: string
  name?: string
  capability?: string
  group?: string
  broadcast?: boolean
  /** Recipient's project name (second-level routing after the node). */
  project?: string
}

/** An optional attachment carried by a message. */
export interface AttachmentRef {
  filename: string
  size: number
  hash: string
  ref: string
}

/** Envelope routing kind. */
export type EnvelopeKind = 'request' | 'reply' | 'event'

/** The unified message envelope. */
export interface Envelope {
  id: string
  kind: EnvelopeKind
  from: PeerRef
  to: Address
  replyTo?: string
  body: string
  attachment?: AttachmentRef
  ts: number
  auto?: boolean
  depth?: number
}

/** A peer's directory entry. */
export interface PeerInfo {
  id: string
  name: string
  capabilities: string[]
  /** Project names this peer chose to broadcast (never paths). */
  projects: string[]
  host: string
  port: number
  lastSeen: number
  manual: boolean
}

/** LLM-backed reply drafting + gate decision (injected; the Host wires the real model). */
export interface ReplyEngine {
  draftReply(envelope: Envelope): Promise<{ needsGate: boolean; body: string }>
}

/** Read-only peer directory used to resolve send targets to addresses. */
export interface PeerDirectory {
  resolveById(id: string): PeerInfo | undefined
  resolveByName(name: string): PeerInfo | undefined
  resolveByCapability(capability: string): PeerInfo[]
  peers(): PeerInfo[]
}

/** How an outbound message is addressed. */
export interface SendTarget {
  id?: string
  name?: string
  capability?: string
  broadcast?: boolean
  /** Recipient's project name (second-level routing after the node). */
  project?: string
}

export interface AgentOptions {
  sendWaitTimeoutMs?: number
  /**
   * Quick synchronous wait window for send-and-wait: when no reply arrives
   * within it, the wait is suspended to the background (status 'pending') and
   * the reply (or total-timeout) is delivered later via the 'wait-settled'
   * event. Zero/negative disables the window (always wait the full timeout).
   */
  quickWaitMs?: number
  /** Local project table; resolves `to.project` to a directory. */
  projects?: ProjectEntry[]
  /**
   * This node's reachable advertised address (host + effective port), attached
   * to every outbound envelope's `from` so peers can automatically learn how to
   * reach us (first-contact pairing).
   */
  advertised?: { host: string; port: number }
  /**
   * Host callback: run a request in a fresh session under the project dir and
   * return the AI's final answer (empty string when the run cannot start).
   * `senderName` identifies the requesting peer so the host keeps one
   * conversation per (project, colleague) pair.
   */
  startProjectTask?: (project: ProjectEntry, body: string, senderName: string) => Promise<string>
}

/** A pending-gate item: an inbound request whose draft reply awaits human review. */
export interface GateItem {
  original: Envelope
  draftBody: string
}

export type SendAndWaitResult =
  | { status: 'reply'; reply: Envelope }
  | { status: 'timeout' }
  | { status: 'queued' }
  /** The quick wait window elapsed: the wait continues in the background and
   *  the eventual reply/timeout is delivered via the 'wait-settled' event. */
  | { status: 'pending'; requestId: string }

/** 'wait-settled' payload: the background outcome of one suspended wait. */
export interface WaitSettledEvent {
  /** The outbound request envelope id the wait was keyed on. */
  requestId: string
  /** 'reply' with the envelope, or 'timeout' when the total timeout elapsed. */
  result: { status: 'reply'; reply: Envelope } | { status: 'timeout' }
}

/** Manual peer address entry (fallback when auto-discovery is blocked). */
export interface ManualPeer {
  name: string
  host: string
  port: number
}

/** One local project the node can receive requests for. */
export interface ProjectEntry {
  /** Node-local unique, human-readable project name (slug). */
  name: string
  /** Absolute local directory the project lives in (never broadcast). */
  path: string
  /** Whether this project's name is broadcast to peers; default false. */
  broadcast: boolean
}

/** Human-review sensitivity for the receiver's auto-reply engine. */
export type Sensitivity = 'lenient' | 'standard' | 'strict'

/** The full editable P2P node configuration (the settings-panel shape). */
export interface Config {
  nodeName: string
  /** Host advertised to peers; empty = auto-detect the LAN address (WSL: set your Windows host's LAN IP when port-forwarding). */
  advertisedHost: string
  capabilities: string[]
  autoDiscover: boolean
  manualPeers: ManualPeer[]
  /** Auto-accept a previously-unknown peer on first contact (payload carries its address). */
  autoAccept: boolean
  /** Peers auto-learned on first contact and persisted (distinct from manual, not reconciled). */
  knownPeers: ManualPeer[]
  port: number
  sensitivity: Sensitivity
  sendWaitTimeoutMs: number
  /** Quick synchronous wait window before suspending a send-and-wait to the background (ms). */
  quickWaitMs: number
  provider: string
  model: string
  persona: string
  projects: ProjectEntry[]
  /** When true the settings panel shows raw wire JSON frames and runtime snapshots. */
  debug: boolean
}

/** Runtime listener status (as opposed to the requested config). */
export interface NodeStatus {
  /** LAN-advertised host this node announces. */
  host: string
  /** The port requested in config (what the user asked for). */
  requestedPort: number
  /** The port actually bound; equals requestedPort unless it was busy and the transport walked upward. */
  effectivePort: number
  /** Whether transport + discovery are currently running. */
  started: boolean
}

/** One recorded raw wire frame (debug mode). */
export interface WireFrame {
  /** `in` = received from a peer, `out` = sent to a peer. */
  dir: 'in' | 'out'
  /** Epoch ms. */
  ts: number
  /** The raw wire JSON (`{type:'envelope'|'ack',...}`). */
  json: string
}

/** Debug-mode snapshot: version + live runtime data. */
export interface DebugSnapshot {
  /** Plugin version read from the installed package.json. */
  version: string
  /** Whether the debug config flag is on (the panel shows this section only then). */
  debug: boolean
  nodeName: string
  advertisedHost: string
  requestedPort: number
  effectivePort: number
  started: boolean
  /** Most recent wire frames, newest first. */
  frames: WireFrame[]
  /** Discovery directory (excluding self). */
  peers: PeerInfo[]
  outboxCount: number
  inboxCount: number
  gateCount: number
  pendingWaits: number
  outboundConnections: number
  inboundConnections: number
}

/** One LLM provider route plus its advertised models (for the settings selector). */
export interface LlmOption {
  /** Provider route key (used by reply-engine `provider`). */
  provider: string
  /** Human-readable provider name for the selector. */
  providerName: string
  /** Model ids advertised by this provider. */
  models: string[]
}
