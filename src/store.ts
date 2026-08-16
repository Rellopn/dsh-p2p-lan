/** Send/inbox state: outbox queue, inbox (AI/human read tracking), dead letter. @module @rellopn/dsh-p2p-lan */

import { EventEmitter } from 'node:events'
import type { Envelope } from './messages.ts'
import type { PeerAddress } from './transport.ts'

/** Minimal send surface the store needs from the transport. */
export interface TransportLike {
  send(peer: PeerAddress, envelope: Envelope): Promise<void>
}

/** One queued outbound message. */
export interface OutboxEntry {
  peer: PeerAddress
  envelope: Envelope
  attempts: number
}

/** One inbound message with AI/human read state. */
export interface InboxEntry {
  envelope: Envelope
  aiRead: boolean
  humanRead: boolean
  receivedAt: number
}

export interface StoreOptions {
  maxSendAttempts?: number
}

export const DEFAULT_MAX_SEND_ATTEMPTS = 5

/** Durable local queue for outbound retry and inbound async delivery. */
export class Store extends EventEmitter {
  private readonly maxSendAttempts: number
  private readonly outbox: OutboxEntry[] = []
  private readonly inbox: InboxEntry[] = []
  private readonly deadLetter: OutboxEntry[] = []

  constructor(private readonly transport: TransportLike, options: StoreOptions = {}) {
    super()
    this.maxSendAttempts = options.maxSendAttempts ?? DEFAULT_MAX_SEND_ATTEMPTS
  }

  /** Try to send now; on failure queue to the outbox. */
  async send(peer: PeerAddress, envelope: Envelope): Promise<'delivered' | 'queued'> {
    try {
      await this.transport.send(peer, envelope)
      this.emit('delivered', envelope.id)
      return 'delivered'
    } catch {
      this.queueOutgoing(peer, envelope)
      return 'queued'
    }
  }

  /** Explicitly queue an envelope for a peer. */
  queueOutgoing(peer: PeerAddress, envelope: Envelope): void {
    this.outbox.push({ peer, envelope, attempts: 0 })
  }

  /**
   * Attempt every outbox entry once. Success removes it; failure increments the
   * attempt count and, once `maxSendAttempts` is reached, moves it to the dead
   * letter and emits `send-failed`. Returns how many entries remain queued.
   */
  async flush(): Promise<number> {
    const remaining: OutboxEntry[] = []
    for (const entry of this.outbox) {
      let sent = false
      try {
        await this.transport.send(entry.peer, entry.envelope)
        sent = true
      } catch {
        sent = false
      }
      if (sent) {
        this.emit('delivered', entry.envelope.id)
        continue
      }
      const attempts = entry.attempts + 1
      if (attempts >= this.maxSendAttempts) {
        this.deadLetter.push({ ...entry, attempts })
        this.emit('send-failed', entry.envelope)
      } else {
        remaining.push({ ...entry, attempts })
      }
    }
    this.outbox.length = 0
    this.outbox.push(...remaining)
    return this.outbox.length
  }

  outboxSnapshot(): OutboxEntry[] {
    return [...this.outbox]
  }

  deadLetterSnapshot(): OutboxEntry[] {
    return [...this.deadLetter]
  }

  /** Store an inbound (async) message and signal `message-received`. */
  deliverInbound(envelope: Envelope): void {
    this.inbox.push({ envelope, aiRead: false, humanRead: false, receivedAt: Date.now() })
    this.emit('message-received', envelope)
  }

  /** AI reads messages it has not seen yet; marks them aiRead without clearing the human unread badge. */
  checkInbox(): Envelope[] {
    const result: Envelope[] = []
    for (const entry of this.inbox) {
      if (!entry.aiRead) {
        result.push(entry.envelope)
        entry.aiRead = true
      }
    }
    return result
  }

  /** Human opens a peer's thread: clear that peer's human unread. */
  markThreadRead(peerId: string): void {
    for (const entry of this.inbox) {
      if (entry.envelope.from.id === peerId) entry.humanRead = true
    }
  }

  /** Count of messages the human has not opened yet, optionally for one peer. */
  humanUnreadCount(peerId?: string): number {
    let count = 0
    for (const entry of this.inbox) {
      if (entry.humanRead) continue
      if (peerId === undefined || entry.envelope.from.id === peerId) count++
    }
    return count
  }
}
