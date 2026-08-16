/** Agent orchestration: outbound tools, inbound routing, auto-reply/gate engine. @module @rellopn/dsh-p2p-lan */

import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { DEFAULT_SEND_WAIT_TIMEOUT_MS } from './config.ts'
import type { PeerInfo } from './discovery.ts'
import type { NodeIdentity } from './identity.ts'
import { MAX_REPLY_DEPTH } from './messages.ts'
import type { Address, AttachmentRef, Envelope } from './messages.ts'
import type { Store } from './store.ts'
import type { PeerAddress } from './transport.ts'
import type {
  AgentOptions,
  GateItem,
  PeerDirectory,
  ProjectEntry,
  ReplyEngine,
  SendAndWaitResult,
  SendTarget,
} from './types.ts'

// Wire types live in ./types.ts (type-only); re-exported for host/test import sites.
export type {
  AgentOptions,
  GateItem,
  PeerDirectory,
  ProjectEntry,
  ReplyEngine,
  SendAndWaitResult,
  SendTarget,
} from './types.ts'

/** Outbound/inbound orchestration for one node. */
export class Agent extends EventEmitter {
  private readonly identity: NodeIdentity
  private readonly store: Store
  private readonly directory: PeerDirectory
  private readonly replyEngine: ReplyEngine
  private readonly sendWaitTimeoutMs: number
  private projects: ProjectEntry[] | undefined
  private readonly startProjectTask: ((project: ProjectEntry, body: string) => Promise<string>) | undefined
  private readonly pending = new Map<string, { resolve: (reply: Envelope | undefined) => void; timer: ReturnType<typeof setTimeout> }>()
  private readonly gates = new Map<string, GateItem>()

  constructor(identity: NodeIdentity, store: Store, directory: PeerDirectory, replyEngine: ReplyEngine, options: AgentOptions = {}) {
    super()
    this.identity = identity
    this.store = store
    this.directory = directory
    this.replyEngine = replyEngine
    this.sendWaitTimeoutMs = options.sendWaitTimeoutMs ?? DEFAULT_SEND_WAIT_TIMEOUT_MS
    this.projects = options.projects
    this.startProjectTask = options.startProjectTask
  }

  /** Async send to one or more peers; resolves to offline/delivered/queued. */
  async send(target: SendTarget, body: string, attachment?: AttachmentRef): Promise<'delivered' | 'queued' | 'offline'> {
    const addresses = this.resolveTarget(target)
    if (addresses.length === 0) return 'offline'
    const envelope = this.newEnvelope('request', this.toAddress(target), body, attachment)
    let queued = false
    for (const address of addresses) {
      const outcome = await this.store.send(address, envelope)
      if (outcome === 'queued') queued = true
    }
    return queued ? 'queued' : 'delivered'
  }

  /** Synchronous send: block until a reply or timeout, or return queued when the peer is offline. */
  async sendAndWait(target: SendTarget, body: string): Promise<SendAndWaitResult> {
    const addresses = this.resolveTarget(target)
    const address = addresses[0]
    if (address === undefined) return { status: 'queued' }
    const envelope = this.newEnvelope('request', this.toAddress(target), body)
    const outcome = await this.store.send(address, envelope)
    if (outcome === 'queued') return { status: 'queued' }
    return this.awaitReply(envelope.id)
  }

  /** AI reads its unseen inbox messages (does not clear the human unread badge). */
  checkInbox(): Envelope[] {
    return this.store.checkInbox()
  }

  gateSnapshot(): Array<GateItem & { id: string }> {
    return [...this.gates.entries()].map(([id, item]) => ({ id, ...item }))
  }

  /** Replace the project table (used by live settings edits). */
  setProjects(projects: ProjectEntry[] | undefined): void {
    this.projects = projects
  }

  /** Route one inbound envelope: resolve a pending wait, else inbox, else auto-reply/gate. */
  async handleInbound(envelope: Envelope): Promise<void> {
    if (envelope.kind === 'reply' && envelope.replyTo !== undefined) {
      const pending = this.pending.get(envelope.replyTo)
      if (pending !== undefined) {
        clearTimeout(pending.timer)
        this.pending.delete(envelope.replyTo)
        pending.resolve(envelope)
        return
      }
      this.store.deliverInbound(envelope)
      return
    }

    if (envelope.to.broadcast === true) {
      this.store.deliverInbound(envelope)
      return
    }

    const peer = this.resolvePeer(envelope.from.id, envelope.from.name)
    if (peer === undefined) {
      this.store.deliverInbound(envelope)
      return
    }

    const draft = await this.replyEngine.draftReply(envelope)
    const forceGate = envelope.auto === true && (envelope.depth ?? 0) >= MAX_REPLY_DEPTH

    // A project-targeted request runs a real session in that project: the reply
    // is the AI's actual answer (never a hallucinated draft). Gated requests
    // run the session on approval instead — see approveGate.
    const project = this.resolveProject(envelope)
    if (project !== undefined) {
      if (draft.needsGate || forceGate) {
        this.gates.set(envelope.id, { original: envelope, draftBody: '' })
        this.emit('gate-required', { id: envelope.id, original: envelope, draftBody: '' })
        return
      }
      const answer = await this.runProjectTask(project, envelope.body)
      await this.sendReply(envelope, peer, answer, true)
      return
    }

    if (draft.needsGate || forceGate) {
      this.gates.set(envelope.id, { original: envelope, draftBody: draft.body })
      this.emit('gate-required', { id: envelope.id, original: envelope, draftBody: draft.body })
      return
    }
    await this.sendReply(envelope, peer, draft.body, true)
  }

  /** Human approves a gated request: runs the project session (reply = result) or sends the edited draft. */
  async approveGate(id: string, finalBody?: string): Promise<void> {
    const item = this.gates.get(id)
    if (item === undefined) return
    this.gates.delete(id)
    const peer = this.resolvePeer(item.original.from.id, item.original.from.name)

    // A project-targeted request runs its session now; the reply is the result.
    const project = this.resolveProject(item.original)
    if (project !== undefined) {
      const answer = await this.runProjectTask(project, item.original.body)
      if (peer !== undefined) await this.sendReply(item.original, peer, answer, false)
      return
    }

    // A plain request replies with the (possibly edited) draft.
    const body = finalBody ?? item.draftBody
    if (peer !== undefined) await this.sendReply(item.original, peer, body, false)
  }

  /** Resolve the local project a request targets, when one matches. */
  private resolveProject(envelope: Envelope): ProjectEntry | undefined {
    const projectName = envelope.to.project
    if (projectName === undefined) return undefined
    return this.projects?.find(entry => entry.name === projectName)
  }

  /** Run the project session and return the AI's answer ('' when it cannot start). */
  private async runProjectTask(project: ProjectEntry, body: string): Promise<string> {
    if (this.startProjectTask === undefined) return ''
    return this.startProjectTask(project, body)
  }

  /** Human rejects a gated draft. */
  rejectGate(id: string): void {
    this.gates.delete(id)
  }

  private async sendReply(original: Envelope, peer: PeerInfo, body: string, auto: boolean): Promise<void> {
    const reply = this.newEnvelope('reply', { id: original.from.id, name: original.from.name }, body)
    reply.replyTo = original.id
    reply.auto = auto
    reply.depth = (original.depth ?? 0) + 1
    await this.store.send({ host: peer.host, port: peer.port }, reply)
  }

  private awaitReply(id: string): Promise<SendAndWaitResult> {
    return new Promise((resolveResult) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolveResult({ status: 'timeout' })
      }, this.sendWaitTimeoutMs)
      this.pending.set(id, {
        timer,
        resolve: reply => resolveResult(reply === undefined ? { status: 'timeout' } : { status: 'reply', reply }),
      })
    })
  }

  private resolveTarget(target: SendTarget): PeerAddress[] {
    if (target.broadcast === true) return this.directory.peers().map(toAddress)
    if (target.capability !== undefined) return this.directory.resolveByCapability(target.capability).map(toAddress)
    if (target.id !== undefined) {
      const peer = this.directory.resolveById(target.id)
      return peer === undefined ? [] : [toAddress(peer)]
    }
    if (target.name !== undefined) {
      const peer = this.directory.resolveByName(target.name)
      return peer === undefined ? [] : [toAddress(peer)]
    }
    return []
  }

  private resolvePeer(id: string, name: string): PeerInfo | undefined {
    return this.directory.resolveById(id) ?? this.directory.resolveByName(name)
  }

  private toAddress(target: SendTarget): Address {
    const to: Address = {}
    if (target.id !== undefined) to.id = target.id
    if (target.name !== undefined) to.name = target.name
    if (target.capability !== undefined) to.capability = target.capability
    if (target.broadcast !== undefined) to.broadcast = target.broadcast
    if (target.project !== undefined) to.project = target.project
    return to
  }

  private newEnvelope(kind: Envelope['kind'], to: Address, body: string, attachment?: AttachmentRef): Envelope {
    const envelope: Envelope = {
      id: randomUUID(),
      kind,
      from: { id: this.identity.id, name: this.identity.name },
      to,
      body,
      ts: Date.now(),
    }
    if (attachment !== undefined) envelope.attachment = attachment
    return envelope
  }
}

function toAddress(peer: PeerInfo): PeerAddress {
  return { host: peer.host, port: peer.port }
}
