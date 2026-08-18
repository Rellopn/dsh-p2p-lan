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
  private sendWaitTimeoutMs: number
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

  /** All inbound messages (read-only snapshot; does NOT mark read). */
  inboxSnapshot(): Envelope[] {
    return this.store.inboxSnapshot()
  }

  gateSnapshot(): Array<GateItem & { id: string }> {
    return [...this.gates.entries()].map(([id, item]) => ({ id, ...item }))
  }

  /** Replace the project table (used by live settings edits). */
  setProjects(projects: ProjectEntry[] | undefined): void {
    this.projects = projects
  }

  /** Update the synchronous-reply timeout (used by live settings edits). */
  setSendWaitTimeoutMs(ms: number): void {
    this.sendWaitTimeoutMs = ms
  }

  /** Number of send-and-wait requests currently awaiting a reply (debug snapshot). */
  pendingWaits(): number {
    return this.pending.size
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

    // Record every recognized request in the inbox too, so a human watching the
    // node can see the incoming message (auto-reply/gate run on top of it).
    this.store.deliverInbound(envelope)

    const draft = await this.replyEngine.draftReply(envelope)
    const forceGate = envelope.auto === true && (envelope.depth ?? 0) >= MAX_REPLY_DEPTH

    // A project-targeted request runs a real session in that project: the reply
    // is the AI's actual answer (never a hallucinated draft). Gated requests
    // run the session on approval instead — see approveGate. A plain request
    // that merely NAMES a project also runs that project's session (see inferProject).
    const project = this.resolveProject(envelope) ?? this.inferProject(envelope.body)
    if (project !== undefined) {
      if (draft.needsGate || forceGate) {
        this.gates.set(envelope.id, { original: envelope, draftBody: '' })
        this.emit('gate-required', { id: envelope.id, original: envelope, draftBody: '' })
        return
      }
      const answer = await this.runProjectTask(project, envelope.body)
      // A project session that produced no text must never auto-reply empty:
      // gate it so a human decides (edit/reject) instead of sending ''.
      if (answer.trim() === '') {
        this.gates.set(envelope.id, { original: envelope, draftBody: '' })
        this.emit('gate-required', { id: envelope.id, original: envelope, draftBody: '' })
        return
      }
      await this.sendReply(envelope, peer, answer, true)
      return
    }

    // An empty draft (LLM failed, no provider/model, or model returned no
    // text) must never auto-reply: it becomes a gate the human must edit.
    if (draft.needsGate || forceGate || draft.body.trim() === '') {
      this.gates.set(envelope.id, { original: envelope, draftBody: draft.body })
      this.emit('gate-required', { id: envelope.id, original: envelope, draftBody: draft.body })
      return
    }
    await this.sendReply(envelope, peer, draft.body, true)
  }

  /** Human approves a gated request: runs the project session (reply = result) or sends the edited draft. */
  async approveGate(id: string, finalBody?: string): Promise<boolean> {
    const item = this.gates.get(id)
    if (item === undefined) return false
    const peer = this.resolvePeer(item.original.from.id, item.original.from.name)

    // A project-targeted request runs its session now; the reply is the result.
    const project = this.resolveProject(item.original)
    if (project !== undefined) {
      const answer = await this.runProjectTask(project, item.original.body)
      // Never send an empty answer: keep the gate so the human can edit/reject.
      if (answer.trim() === '') return false
      this.gates.delete(id)
      if (peer !== undefined) await this.sendReply(item.original, peer, answer, false)
      return true
    }

    // A plain request replies with the (possibly edited) draft. An empty draft
    // (LLM failure / no provider) must never be sent: keep the gate and refuse
    // until the human actually writes something.
    const body = finalBody ?? item.draftBody
    if (body.trim() === '') return false
    this.gates.delete(id)
    if (peer !== undefined) await this.sendReply(item.original, peer, body, false)
    return true
  }

  /** Resolve the local project a request targets, when one matches. */
  private resolveProject(envelope: Envelope): ProjectEntry | undefined {
    const projectName = envelope.to.project
    if (projectName === undefined) return undefined
    return this.projects?.find(entry => entry.name === projectName)
  }

  /**
   * Infer a project from a plain (non project-targeted) message body: when the
   * text names one of this node's projects, route the request into that
   * project's real session so questions like "what files are in 智能船" read the
   * actual directory instead of an auto-reply that has no filesystem access.
   * Longest name wins so "智能船" is not shadowed by a hypothetical "智能".
   */
  private inferProject(body: string): ProjectEntry | undefined {
    const matches = this.projects?.filter(entry => entry.name !== '' && body.includes(entry.name)) ?? []
    if (matches.length === 0) return undefined
    matches.sort((left, right) => right.name.length - left.name.length)
    return matches[0]
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
