/** WebSocket transport: server + client, transport ack, id dedupe, retry with backoff. @module @rellopn/dsh-p2p-lan */

import { EventEmitter } from 'node:events'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { validateEnvelope, type Envelope } from './messages.ts'

/** A remote transport address. */
export interface PeerAddress {
  host: string
  port: number
}

/** Wire protocol: an envelope, or a transport-level ack for one envelope id. */
export type WireMessage = { type: 'envelope'; envelope: Envelope } | { type: 'ack'; id: string }

export interface TransportOptions {
  port: number
  host?: string
  connectTimeoutMs?: number
  ackTimeoutMs?: number
  maxRetries?: number
  retryBaseDelayMs?: number
}

export const DEFAULT_CONNECT_TIMEOUT_MS = 5000
export const DEFAULT_ACK_TIMEOUT_MS = 5000
export const DEFAULT_MAX_RETRIES = 5
export const DEFAULT_RETRY_BASE_DELAY_MS = 250

interface PendingAck {
  resolve: () => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
  socket: WebSocket
}

/** Bidirectional envelope transport over WebSocket. Emits `envelope` for deduped inbound envelopes. */
export class Transport extends EventEmitter {
  private readonly port: number
  private readonly host: string
  private readonly connectTimeoutMs: number
  private readonly ackTimeoutMs: number
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number

  private server: WebSocketServer | undefined
  private readonly seen = new Set<string>()
  private readonly clients = new Map<string, WebSocket>()
  private readonly pending = new Map<string, PendingAck>()

  constructor(options: TransportOptions) {
    super()
    this.port = options.port
    this.host = options.host ?? '0.0.0.0'
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    this.ackTimeoutMs = options.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS
  }

  /** Start the WebSocket server. */
  start(): void {
    const server = new WebSocketServer({ host: this.host, port: this.port })
    server.on('connection', (socket) => {
      socket.on('message', data => this.handleMessage(socket, data))
    })
    server.on('error', err => this.emit('error', err))
    this.server = server
  }

  /** Close every connection and the server. */
  async stop(): Promise<void> {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('transport stopped'))
    }
    this.pending.clear()
    for (const socket of this.clients.values()) socket.terminate()
    this.clients.clear()
    const server = this.server
    if (server !== undefined) {
      for (const client of server.clients) client.terminate()
      await new Promise<void>(resolve => server.close(() => resolve()))
      this.server = undefined
    }
  }

  /** Send one envelope to a peer and wait for its transport ack. */
  async send(peer: PeerAddress, envelope: Envelope): Promise<void> {
    const socket = await this.connect(peer)
    await this.deliver(socket, envelope)
  }

  private async connect(peer: PeerAddress): Promise<WebSocket> {
    const key = `${peer.host}:${peer.port}`
    const existing = this.clients.get(key)
    if (existing !== undefined && existing.readyState === WebSocket.OPEN) return existing

    let lastError: Error | undefined
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const socket = await this.dial(peer)
        this.clients.set(key, socket)
        socket.on('message', data => this.handleMessage(socket, data))
        socket.on('close', () => {
          this.clients.delete(key)
          this.failSocket(socket)
        })
        socket.on('error', () => {
          this.clients.delete(key)
          this.failSocket(socket)
        })
        return socket
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < this.maxRetries) await sleep(this.retryBaseDelayMs * 2 ** attempt)
      }
    }
    throw lastError ?? new Error('connect failed')
  }

  private dial(peer: PeerAddress): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://${peer.host}:${peer.port}`)
      const timer = setTimeout(() => {
        socket.terminate()
        reject(new Error('connect timeout'))
      }, this.connectTimeoutMs)
      socket.once('open', () => {
        clearTimeout(timer)
        resolve(socket)
      })
      socket.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  private deliver(socket: WebSocket, envelope: Envelope): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(envelope.id)
        reject(new Error('ack timeout'))
      }, this.ackTimeoutMs)
      this.pending.set(envelope.id, { resolve, reject, timer, socket })
      socket.send(encode({ type: 'envelope', envelope }))
    })
  }

  private handleMessage(socket: WebSocket, data: RawData): void {
    let msg: WireMessage
    try {
      msg = JSON.parse(data.toString('utf8')) as WireMessage
    } catch {
      return
    }

    if (msg.type === 'ack') {
      const pending = this.pending.get(msg.id)
      if (pending !== undefined) {
        clearTimeout(pending.timer)
        this.pending.delete(msg.id)
        pending.resolve()
      }
      return
    }

    if (msg.type === 'envelope') {
      const result = validateEnvelope(msg.envelope)
      if (!result.ok) return
      const envelope = msg.envelope
      // Transport ack is a receipt, not "read"/"replied".
      socket.send(encode({ type: 'ack', id: envelope.id }))
      if (this.seen.has(envelope.id)) return
      this.seen.add(envelope.id)
      this.emit('envelope', envelope)
    }
  }

  private failSocket(socket: WebSocket): void {
    for (const [id, pending] of this.pending) {
      if (pending.socket === socket) {
        clearTimeout(pending.timer)
        this.pending.delete(id)
        pending.reject(new Error('socket closed before ack'))
      }
    }
  }
}

function encode(msg: WireMessage): string {
  return JSON.stringify(msg)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
