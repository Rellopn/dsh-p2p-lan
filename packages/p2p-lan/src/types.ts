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
  /** Local project table; resolves `to.project` to a directory. */
  projects?: ProjectEntry[]
  /**
   * Host callback: run a request in a fresh session under the project dir and
   * return the AI's final answer (empty string when the run cannot start).
   */
  startProjectTask?: (project: ProjectEntry, body: string) => Promise<string>
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
