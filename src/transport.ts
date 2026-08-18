/** WebSocket transport: server + client, transport ack, id dedupe, retry with backoff. @module @rellopn/dsh-p2p-lan */

import { EventEmitter } from 'node:events'
import { createServer, type Server } from 'node:http'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { DEFAULT_PORT_RETRIES } from './config.ts'
import { validateEnvelope, type Envelope } from './messages.ts'

/** A remote transport address. */
export interface PeerAddress {
  host: string
  port: number
}

/** Wire protocol: an envelope, or a transport-level ack for one envelope id. */
export type WireMessage = { type: 'envelope'; envelope: Envelope } | { type: 'ack'; id: string }

export interface TransportOptions {
  /** Requested listen port; the transport may bind a higher free port when busy. */
  port: number
  host?: string
  connectTimeoutMs?: number
  ackTimeoutMs?: number
  maxRetries?: number
  retryBaseDelayMs?: number
  /** How many consecutive busy ports to try beyond the requested one before failing. */
  portRetries?: number
  /** Grace period to wait before giving up on the requested port (lets a just-closed previous server release it). */
  portRetryDelayMs?: number
}

export const DEFAULT_CONNECT_TIMEOUT_MS = 5000
export const DEFAULT_ACK_TIMEOUT_MS = 5000
export const DEFAULT_MAX_RETRIES = 5
export const DEFAULT_RETRY_BASE_DELAY_MS = 250
/** How long a briefly-occupied requested port is worth waiting for (hot-reload reuse). */
export const DEFAULT_PORT_RETRY_DELAY_MS = 300

interface PendingAck {
  resolve: () => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
  socket: WebSocket
}

/** Bidirectional envelope transport over WebSocket. Emits `envelope` for deduped inbound envelopes. */
export class Transport extends EventEmitter {
  private readonly requestedPort: number
  private readonly host: string
  private readonly connectTimeoutMs: number
  private readonly ackTimeoutMs: number
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number
  private readonly portRetries: number
  private readonly portRetryDelayMs: number

  private server: WebSocketServer | undefined
  /** The underlying http server we listen on (ws' WSS.close() does NOT close an externally-passed server). */
  private httpServer: Server | undefined
  /** The port actually bound by the last successful start(). */
  private boundPort: number | undefined
  /** Set by stop(); a bind that resolves afterwards must not leave a server behind. */
  private closing = false
  private readonly seen = new Set<string>()
  private readonly clients = new Map<string, WebSocket>()
  private readonly pending = new Map<string, PendingAck>()

  constructor(options: TransportOptions) {
    super()
    this.requestedPort = options.port
    this.host = options.host ?? '0.0.0.0'
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    this.ackTimeoutMs = options.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS
    this.portRetries = options.portRetries ?? DEFAULT_PORT_RETRIES
    this.portRetryDelayMs = options.portRetryDelayMs ?? DEFAULT_PORT_RETRY_DELAY_MS
  }

  /** The port actually bound after start(); undefined before start / after stop. */
  effectivePort(): number | undefined {
    return this.boundPort
  }

  /**
   * Start the WebSocket server, returning the port actually bound. Tries the
   * requested port first; when it is taken (EADDRINUSE, e.g. another dsh on the
   * same machine) it walks upward through the next free ports, so several
   * instances can coexist without manual configuration. The requested port gets
   * one grace-period retry before that walk: a hot-reloaded node's previous
   * server may still be releasing the port, and giving it a moment keeps the
   * effective port stable instead of drifting by one on every reload.
   */
  async start(): Promise<number> {
    if (this.server !== undefined) return this.boundPort ?? this.requestedPort
    this.closing = false
    let lastError: unknown = undefined
    for (let attempt = 0; attempt <= this.portRetries; attempt += 1) {
      const candidate = this.requestedPort + attempt
      try {
        return await this.bindOnce(candidate)
      } catch (err) {
        const code = (err as { code?: string }).code
        if (code !== 'EADDRINUSE' && code !== 'EACCES') {
          // A non-port-conflict failure (bad host, privileges, …): surface it
          // instead of silently walking the port range.
          throw new Error(`p2p-lan: failed to bind WebSocket server on ${candidate}: ${(err as Error).message}`)
        }
        lastError = err
        // Only the requested port is worth a grace wait: it is the one our own
        // just-stopped server is likely still releasing. Walked candidates were
        // freshly explored and are treated as genuinely occupied.
        if (attempt === 0 && this.portRetryDelayMs > 0) {
          await sleep(this.portRetryDelayMs)
          try {
            return await this.bindOnce(candidate)
          } catch (retryErr) {
            const retryCode = (retryErr as { code?: string }).code
            if (retryCode !== 'EADDRINUSE' && retryCode !== 'EACCES') {
              throw new Error(`p2p-lan: failed to bind WebSocket server on ${candidate}: ${(retryErr as Error).message}`)
            }
            lastError = retryErr
          }
        }
      }
    }
    const detail = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`p2p-lan: no free port in ${this.requestedPort}..${this.requestedPort + this.portRetries} (last error: ${detail})`)
  }

  /** Bind one candidate port and attach the WebSocket server to it. */
  private async bindOnce(candidate: number): Promise<number> {
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => {
        server.removeListener('listening', onListening)
        reject(err)
      }
      const onListening = (): void => {
        server.removeListener('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(candidate, this.host)
    })
    if (this.closing) {
      server.close()
      this.boundPort = undefined
      throw new Error('p2p-lan: transport stopped during start')
    }
    this.boundPort = candidate
    server.on('error', err => this.emit('error', err))
    const wss = new WebSocketServer({ server })
    wss.on('error', err => this.emit('error', err))
    wss.on('connection', (socket) => {
      socket.on('message', data => this.handleMessage(socket, data))
    })
    this.server = wss
    this.httpServer = server
    return candidate
  }

  /** Close every connection and release the port. */
  async stop(): Promise<void> {
    this.closing = true
    this.boundPort = undefined
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('transport stopped'))
    }
    this.pending.clear()
    for (const socket of this.clients.values()) socket.terminate()
    this.clients.clear()
    const wss = this.server
    if (wss !== undefined) {
      for (const client of wss.clients) client.terminate()
      this.server = undefined
    }
    // ws' WebSocketServer.close() does NOT close an externally-passed http
    // server, so close the http server directly — otherwise the port would be
    // leaked on every stop (hot-reload drift / "conflicts with itself").
    const httpServer = this.httpServer
    this.httpServer = undefined
    if (httpServer !== undefined) {
      httpServer.closeAllConnections?.()
      await new Promise<void>((resolve) => {
        if (!httpServer.listening) {
          resolve()
          return
        }
        httpServer.close(() => resolve())
      })
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
