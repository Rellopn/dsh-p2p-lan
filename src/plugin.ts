/** Cordis plugin wiring for LAN P2P collaboration. @module @rellopn/dsh-p2p-lan */

import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { Agent, type GateItem, type SendTarget } from './agent.ts'
import { detectLanAddress, Discovery, type PeerInfo } from './discovery.ts'
import { createIdentity, type NodeIdentity } from './identity.ts'
import type { Envelope } from './messages.ts'
import { createLlmReplyEngine, type MutableReplyEngine } from './reply-engine.ts'
import { Store } from './store.ts'
import { Transport } from './transport.ts'
import { mergeWorkspaces, normalizeProjects, resolveNodeName, validProjects, type ProjectEntry } from './config.ts'
import type { Config as ConfigModel, DebugSnapshot, NodeStatus } from './types.ts'

// The wire type lives in ./types.ts (exported via the `./types` subpath for the
// client/Remote face); re-export it here so this module can use the `Config`
// type name alongside the `Config` z-schema value below.
export type Config = ConfigModel

/**
 * Version of the installed plugin package (resolved at runtime via the
 * package's own `./package.json` export, so it always reflects what is
 * actually installed, not what was baked in at build time).
 */
const require = createRequire(import.meta.url)
let cachedVersion: string | undefined
function pluginVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion
  try {
    cachedVersion = (require('@rellopn/dsh-p2p-lan/package.json') as { version?: string }).version ?? 'unknown'
  } catch {
    cachedVersion = 'unknown'
  }
  return cachedVersion
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    p2p: P2PService
  }
}

export const name = 'p2p-lan'
export const inject = ['tools', 'llm']

/** Plugin configuration schema (defaults apply at mount time). The `Config` type lives in ./types.ts. */
export const Config: z<ConfigModel> = z.object({
  nodeName: z.string().default(''),
  advertisedHost: z.string().default(''),
  capabilities: z.array(z.string()).default([]),
  autoDiscover: z.boolean().default(true),
  manualPeers: z.array(z.object({ name: z.string(), host: z.string(), port: z.number() })).default([]),
  port: z.number().default(53420),
  sensitivity: z.union(['lenient', 'standard', 'strict'] as const).default('standard'),
  sendWaitTimeoutMs: z.number().default(300_000),
  provider: z.string().default(''),
  model: z.string().default(''),
  persona: z.string().default(''),
  projects: z.array(z.object({
    name: z.string(),
    path: z.string(),
    broadcast: z.boolean().default(false),
  })).default([]),
  debug: z.boolean().default(false),
})

/** Settings schema: the full config, editable + persisted from the browser settings panel. */
export const SettingsSchema: z<ConfigModel> = z.object({
  nodeName: z.string(),
  advertisedHost: z.string(),
  capabilities: z.array(z.string()),
  autoDiscover: z.boolean(),
  manualPeers: z.array(z.object({ name: z.string(), host: z.string(), port: z.number() })),
  port: z.number(),
  sensitivity: z.union(['lenient', 'standard', 'strict'] as const),
  sendWaitTimeoutMs: z.number(),
  provider: z.string(),
  model: z.string(),
  persona: z.string(),
  projects: z.array(z.object({
    name: z.string(),
    path: z.string(),
    broadcast: z.boolean().default(false),
  })),
  debug: z.boolean(),
})

/** A reused per-project agent session (the owned create() handle). */
type ProjectSessionHandle = Awaited<ReturnType<NonNullable<Context['agents']>['create']>>
type AgentsRegistry = NonNullable<Context['agents']>
/** Structural view of the agent-default-model service (avoids importing it). */
type AgentDefaultModelService = {
  currentSelection(): { provider: string; model: string } | undefined
}

/** The composed P2P node, provided as `ctx.p2p` and remoted to the client as `remote.p2p`. */
export class P2PService extends TypertRemoteService {
  private identity!: NodeIdentity
  private transport!: Transport
  private store!: Store
  private discovery!: Discovery
  private agent!: Agent
  private replyEngine!: MutableReplyEngine

  /** Latest applied config snapshot. */
  private config: Config
  /** Whether transport + discovery are currently running. */
  private started = false
  /** LAN-advertised host of the current node (filled by buildNode). */
  private lanHost = '127.0.0.1'
  /** Serializes heavy rebuilds so two rapid config saves never race two servers onto one port. */
  private rebuildTail: Promise<void> = Promise.resolve()

  /** Authoritative project-table source (settings-resolved, incl. in-progress rows). */
  private projectsSource: () => ProjectEntry[] = () => []
  /** Durably persist the project table (settings replace). */
  private projectsPersist: (projects: ProjectEntry[]) => Promise<void> = async () => {}
  /** Authoritative full-config source (settings-resolved). */
  private configSource: () => Config = () => this.config
  /** Durably persist the full config (settings replace). */
  private configPersist: (config: Config) => Promise<void> = async () => {}

  /** Per-project reused agent session, keyed by project path. */
  private readonly projectSessions = new Map<string, { handle: ProjectSessionHandle; sessionId: SessionId }>()
  /** Per-project serial queue so followups on one session never overlap. */
  private readonly projectQueues = new Map<string, Promise<unknown>>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'p2p')
    this.config = { ...config }
    this.buildNode(this.config)

    this.ctx.effect(() => {
      void this.startNode()
      return () => {
        this.stopNode()
      }
    }, 'p2p-lan: transport + discovery lifecycle')

    // Dispose every reused project session when this node unloads.
    this.ctx.effect(() => {
      return () => {
        for (const { handle } of this.projectSessions.values()) {
          void handle.dispose()
        }
        this.projectSessions.clear()
        this.projectQueues.clear()
      }
    }, 'p2p-lan: project session cleanup')
  }

  /** Construct the node core from a config snapshot. */
  private buildNode(config: Config): void {
    const projects = normalizeProjects(config.projects)
    const broadcastProjects = projects.filter(entry => entry.broadcast).map(entry => entry.name)
    this.identity = createIdentity(config.nodeName)
    this.lanHost = this.resolveAdvertisedHost(config)
    this.transport = new Transport({ port: config.port })
    this.discovery = new Discovery({
      identity: this.identity,
      capabilities: config.capabilities,
      host: this.lanHost,
      port: config.port,
      autoDiscover: config.autoDiscover,
      manualPeers: config.manualPeers,
      projects,
    })
    this.store = new Store(this.transport)
    this.replyEngine = createLlmReplyEngine(this.ctx, {
      provider: config.provider,
      model: config.model,
      sensitivity: config.sensitivity,
      persona: config.persona,
      nodeName: config.nodeName,
      projects: broadcastProjects,
    })
    this.agent = new Agent(this.identity, this.store, this.discovery, this.replyEngine, {
      sendWaitTimeoutMs: config.sendWaitTimeoutMs,
      projects,
      startProjectTask: this.startProjectTask,
    })

    this.transport.on('envelope', (envelope: Envelope) => {
      this.ctx.logger.info(`p2p-lan: inbound ${envelope.kind} id=${envelope.id} from=${envelope.from.name} to=${JSON.stringify(envelope.to)} body=${envelope.body.slice(0, 80)}`)
      void this.agent.handleInbound(envelope)
    })
    // Forward agent runtime logs (inbound routing / gate decisions) to the host logger.
    this.agent.on('log', (record: { level: 'info' | 'warn' | 'error'; message: string }) => {
      const text = `p2p-lan: ${record.message}`
      if (record.level === 'warn') this.ctx.logger.warn(text)
      else if (record.level === 'error') this.ctx.logger.warn(`p2p-lan: ERROR ${record.message}`)
      else this.ctx.logger.info(text)
    })
    // Don't let a post-bind server error become an unhandled 'error' event.
    this.transport.on('error', (error) => {
      this.ctx.logger.warn('p2p-lan: transport error')
      this.ctx.logger.warn(error)
    })
    this.discovery.on('peer-online', () => {
      void this.store.flush()
    })
  }

  /**
   * The host this node advertises to peers: an explicit `advertisedHost`
   * (e.g. a WSL node behind a Windows port-forward exposing the host's LAN IP)
   * wins; otherwise the detected LAN address is used.
   */
  private resolveAdvertisedHost(config: Config): string {
    const override = config.advertisedHost.trim()
    if (override !== '') return override
    return detectLanAddress() ?? '127.0.0.1'
  }

  /** Bind the WebSocket server, then point discovery at the port actually used. */
  private async startNode(): Promise<void> {
    try {
      const actualPort = await this.transport.start()
      this.discovery.setAdvertisedPort(actualPort)
      this.discovery.start()
      this.started = true
    } catch (error) {
      this.started = false
      this.ctx.logger.warn('p2p-lan: failed to start transport/discovery')
      this.ctx.logger.warn(error)
    }
  }

  private stopNode(): void {
    void this.transport.stop()
    this.discovery.stop()
    this.started = false
  }

  /** Rebuild the node core in place (heavy config changes): stop, rebuild, restart. */
  private async rebuildNode(config: Config): Promise<void> {
    // Serialize: the old server must actually release its port before the new
    // one binds, otherwise a hot reload would see its own closing server as an
    // external occupant and drift to the next free port on every edit.
    await this.transport.stop()
    this.discovery.stop()
    this.started = false
    this.buildNode(config)
    await this.startNode()
  }

  /** Apply a full config snapshot from live settings. Heavy fields (nodeName /
   * port / autoDiscover) rebuild the node core; light fields update in place
   * without dropping the inbox/outbox or tearing down connections.
   */
  applyConfig(next: Config): void {
    const prev = this.config
    this.config = { ...next }

    const heavyChanged = next.nodeName !== prev.nodeName
      || next.port !== prev.port
      || next.autoDiscover !== prev.autoDiscover
    if (heavyChanged) {
      // Queue rebuilds: concurrent rebuilds would race two servers onto the
      // same port and make the node "conflict with itself" (each rebuild leaks
      // the old port and drifts upward on every save).
      this.rebuildTail = this.rebuildTail
        .then(() => this.rebuildNode(next))
        .catch((error) => {
          this.ctx.logger.warn('p2p-lan: node rebuild failed')
          this.ctx.logger.warn(error)
        })
      return
    }

    const valid = validProjects(next.projects)
    const broadcastProjects = valid.filter(entry => entry.broadcast).map(entry => entry.name)
    this.replyEngine.updateOptions({
      provider: next.provider,
      model: next.model,
      sensitivity: next.sensitivity,
      persona: next.persona,
      nodeName: next.nodeName,
      projects: broadcastProjects,
    })
    this.discovery.setCapabilities(next.capabilities)
    this.discovery.setManualPeers(next.manualPeers)
    this.lanHost = this.resolveAdvertisedHost(next)
    this.discovery.setAdvertisedHost(this.lanHost)
    this.agent.setSendWaitTimeoutMs(next.sendWaitTimeoutMs)
    this.discovery.setProjects(broadcastProjects)
    this.agent.setProjects(valid)
  }

  private readonly startProjectTask = async (project: ProjectEntry, body: string): Promise<string> => {
    try {
      const agents = this.ctx.get('agents')
      const defaultModel = this.ctx.get('agentDefaultModel')
      if (agents === undefined || defaultModel === undefined) {
        this.ctx.logger.warn('p2p-lan: startProjectTask skipped (agents or agentDefaultModel unavailable)')
        return ''
      }
      const selection = defaultModel.currentSelection()
      if (selection === undefined) {
        this.ctx.logger.warn('p2p-lan: startProjectTask skipped (no current model selection)')
        return ''
      }

      // Serialize requests per project so followups on the reused session never overlap.
      const key = project.path
      const run = async (): Promise<string> => {
        const session = await this.ensureProjectSession(agents, defaultModel, project)
        if (session === undefined) return ''
        const agent = session.handle.agent
        await agent.whenIdle()
        const firstSeq = agent.session.seq
        agent.followup(createUserMessage({
          content: [{ type: 'text', text: body }],
          source: { kind: 'user' },
        }))
        await agent.whenIdle()
        // The AI's final answer becomes the reply (real result, not a draft).
        let text = ''
        for (const event of agent.session.events) {
          if (event.seq < firstSeq) continue
          if (event.type !== 'assistant/message') continue
          const joined = event.data.message.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('')
          if (joined !== '') text = joined
        }
        return text
      }

      const previous = this.projectQueues.get(key) ?? Promise.resolve()
      const queued = previous.then(run, run)
      this.projectQueues.set(key, queued)
      return await queued
    } catch (error) {
      this.ctx.logger.warn('p2p-lan: startProjectTask failed')
      this.ctx.logger.warn(error)
      return ''
    }
  }

  /** Get — or create once — the reused agent session for one project. */
  private readonly ensureProjectSession = async (
    agents: AgentsRegistry,
    defaultModel: AgentDefaultModelService,
    project: ProjectEntry,
  ): Promise<{ handle: ProjectSessionHandle; sessionId: SessionId } | undefined> => {
    const key = project.path
    const existing = this.projectSessions.get(key)
    if (existing !== undefined) return existing

    const selection = defaultModel.currentSelection()
    if (selection === undefined) {
      this.ctx.logger.warn('p2p-lan: no current model selection for project session')
      return undefined
    }

    const sessionId = SessionId(`session-${randomUUID()}`)
    // Compose the agent from the deployment's default agent preset (standard /
    // minimal / …), so the collaboration agent carries the same tool set a
    // normal session gets — not just the host-composition tools. A rosterless
    // deployment (no agentPresets service) composes nothing, as before.
    const presets = this.ctx.get('agentPresets')
    let meta: { cwd: string; agentPreset?: string } = { cwd: project.path }
    let setup: ((agentCtx: Context) => Promise<void>) | undefined
    if (presets !== undefined) {
      const preset = await presets.resolve()
      meta = { cwd: project.path, agentPreset: preset.id }
      setup = async (agentCtx) => {
        await presets.mount(agentCtx, preset.id)
      }
    }
    const handle = await agents.create({
      sessionId,
      meta,
      agentOptions: { provider: selection.provider, model: selection.model },
      ...(setup === undefined ? {} : { setup }),
    })

    // Attach the session to the workspace whose path matches the project, so
    // the collaboration appears grouped (not "ungrouped") in the sidebar.
    const registry = this.ctx.get('workspaceRegistry') as
      | { list(): Array<{ path: string; attachSession(id: SessionId): Promise<void> }> }
      | undefined
    if (registry !== undefined) {
      const workspace = registry.list().find(entry => entry.path === project.path)
      if (workspace !== undefined) {
        try {
          await workspace.attachSession(sessionId)
        } catch (error) {
          this.ctx.logger.warn('p2p-lan: workspace attach failed')
          this.ctx.logger.warn(error)
        }
      }
    }

    const entry = { handle, sessionId }
    this.projectSessions.set(key, entry)
    return entry
  }

  @Remote('peers')
  peers(): PeerInfo[] {
    return this.discovery.peers()
  }

  @Remote('checkInbox')
  checkInbox(): Envelope[] {
    return this.agent.checkInbox()
  }

  @Remote('inboxSnapshot')
  inboxSnapshot(): Envelope[] {
    return this.agent.inboxSnapshot()
  }

  @Remote('gateSnapshot')
  gateSnapshot(): Array<GateItem & { id: string }> {
    return this.agent.gateSnapshot()
  }

  @Remote('approveGate')
  async approveGate(id: string, finalBody?: string): Promise<{ ok: boolean }> {
    const ok = await this.agent.approveGate(id, finalBody)
    return { ok }
  }

  @Remote('rejectGate')
  rejectGate(id: string): { ok: boolean } {
    this.agent.rejectGate(id)
    return { ok: true }
  }

  @Remote('getProjects')
  getProjects(): ProjectEntry[] {
    return this.projectsSource()
  }

  @Remote('setProjects')
  async setProjects(projects: ProjectEntry[]): Promise<{ ok: boolean }> {
    await this.projectsPersist(projects)
    return { ok: true }
  }

  @Remote('importWorkspaces')
  async importWorkspaces(): Promise<{ ok: boolean; added: number }> {
    const registry = this.ctx.get('workspaceRegistry') as { list(): Array<{ path: string; title: string }> } | undefined
    if (registry === undefined) return { ok: false, added: 0 }
    const current = this.projectsSource()
    const next = mergeWorkspaces(current, registry.list())
    await this.projectsPersist(next)
    return { ok: true, added: next.length - current.length }
  }

  @Remote('getConfig')
  getConfig(): Config {
    return this.configSource()
  }

  @Remote('setConfig')
  async setConfig(config: Config): Promise<{ ok: boolean }> {
    await this.configPersist(config)
    return { ok: true }
  }

  @Remote('nodeStatus')
  nodeStatus(): NodeStatus {
    return {
      host: this.lanHost,
      requestedPort: this.config.port,
      effectivePort: this.transport.effectivePort() ?? this.config.port,
      started: this.started,
    }
  }

  @Remote('debugSnapshot')
  debugSnapshot(): DebugSnapshot {
    const connections = this.transport.connectionSnapshot()
    return {
      version: pluginVersion(),
      debug: this.config.debug,
      nodeName: this.config.nodeName,
      advertisedHost: this.config.advertisedHost,
      requestedPort: this.config.port,
      effectivePort: this.transport.effectivePort() ?? this.config.port,
      started: this.started,
      frames: this.transport.debugFrames(),
      peers: this.discovery.peers(),
      outboxCount: this.store.outboxSnapshot().length,
      inboxCount: this.agent.inboxSnapshot().length,
      gateCount: this.agent.gateSnapshot().length,
      pendingWaits: this.agent.pendingWaits(),
      outboundConnections: connections.outbound,
      inboundConnections: connections.inbound,
    }
  }

  async send(target: SendTarget, body: string): Promise<'delivered' | 'queued' | 'offline'> {
    return this.agent.send(target, body)
  }

  /** Synchronous send-and-wait, normalized for the `p2p_send_and_wait` tool. */
  async sendAndWait(target: SendTarget, body: string): Promise<{ status: 'reply' | 'timeout' | 'queued'; reply?: { from: string; body: string } }> {
    const result = await this.agent.sendAndWait(target, body)
    if (result.status === 'reply') {
      return { status: 'reply', reply: { from: result.reply.from.name, body: result.reply.body } }
    }
    return { status: result.status }
  }

  /** Wire the settings-resolved project source + persistence into the service. */
  attachProjectsBridge(
    source: () => ProjectEntry[],
    persist: (projects: ProjectEntry[]) => Promise<void>,
  ): void {
    this.projectsSource = source
    this.projectsPersist = persist
  }

  /** Wire the settings-resolved full-config source + persistence into the service. */
  attachConfigBridge(
    source: () => Config,
    persist: (config: Config) => Promise<void>,
  ): void {
    this.configSource = source
    this.configPersist = persist
  }
}

export function apply(ctx: Context, config: Config): void {
  // An empty / legacy ('unnamed') nodeName yields a host-scoped random name
  // (`hostname-abcd`) so several dsh instances on one machine never collide by
  // default. The resolved name is persisted into settings on the first run so
  // the identity survives restarts.
  const initialName = resolveNodeName(config.nodeName)
  const p2p = new P2PService(ctx, { ...config, nodeName: initialName })

  // Live settings: the static `config` is the base; a settings namespace layers
  // the full editable config on top (node name, capability tags, discovery,
  // ports, reply-engine route/gate bias, and the project table). The dsh
  // configuration-client boundary only exposes an allowlisted set of namespaces,
  // so the browser reads/writes this one through the P2P remote (getConfig /
  // setConfig / getProjects / setProjects) instead of settingsScope; the
  // namespace stays the durable store of record Host-side.
  const fallback = (): Config => ({ ...config, nodeName: initialName })
  let configScope: SettingsScope<Config> | undefined
  const source = (): Config => (configScope === undefined ? fallback() : configScope.get())
  ctx.inject(['settings'], (sctx) => {
    configScope = sctx.settings.register(settingsNamespace('p2p'), SettingsSchema, {
      base: { ...config },
    })
    const resolved = source()
    const name = resolveNodeName(resolved.nodeName)
    if (name !== resolved.nodeName) {
      // First run with an unset/legacy name: generate once and persist it, so
      // later restarts reuse the same identity.
      void configScope.replace({ ...resolved, nodeName: name }).then(() => {
        p2p.applyConfig(source())
      })
    }
    p2p.applyConfig(source())
    configScope.watch(() => {
      p2p.applyConfig(source())
    })
  })
  p2p.attachConfigBridge(
    () => source(),
    async (next) => {
      if (configScope === undefined) return
      await configScope.replace({ ...next })
    },
  )
  p2p.attachProjectsBridge(
    () => source().projects,
    async (projects) => {
      if (configScope === undefined) return
      await configScope.replace({ ...source(), projects })
    },
  )

  ctx.tools.register(defineTool({
    name: 'p2p_send',
    description: 'Send a fire-and-forget notification to a LAN peer (async, NO reply). For a question that expects an answer, use p2p_send_and_wait instead. Use broadcast:true to reach everyone, or capability to route to any peer with a capability.',
    parameters: {
      target: {
        type: 'object',
        required: true,
        additionalProperties: false,
        description: 'Recipient: exactly one of name/id/capability/broadcast.',
        properties: {
          name: { type: 'string', description: 'Peer name.' },
          id: { type: 'string', description: 'Peer id.' },
          capability: { type: 'string', description: 'Route to any online peer with this capability.' },
          broadcast: { type: 'boolean', description: 'Send to all online peers.' },
          project: { type: 'string', description: 'Recipient project name (routes the message to a specific project of the peer).' },
        },
      },
      body: { type: 'string', required: true, description: 'Plain-text message body.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true, enum: ['delivered', 'queued', 'offline'] },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `p2p_send: ${value.status}（异步无回复，稍后用 p2p_check_inbox 读取回复）` }],
    },
    async execute(args) {
      return { status: await p2p.send(args.target, args.body) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'p2p_send_and_wait',
    description: 'Send a question to a LAN peer and block until the peer replies or the timeout elapses. Prefer this for request-reply (e.g. asking a colleague for a file). Returns queued when the peer is offline.',
    parameters: {
      target: {
        type: 'object',
        required: true,
        additionalProperties: false,
        description: 'Recipient: exactly one of name/id/capability/broadcast.',
        properties: {
          name: { type: 'string', description: 'Peer name.' },
          id: { type: 'string', description: 'Peer id.' },
          capability: { type: 'string', description: 'Route to any online peer with this capability.' },
          broadcast: { type: 'boolean', description: 'Send to all online peers.' },
          project: { type: 'string', description: 'Recipient project name (routes the message to a specific project of the peer).' },
        },
      },
      body: { type: 'string', required: true, description: 'Plain-text message body.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true, enum: ['reply', 'timeout', 'queued'] },
          reply: {
            type: 'object',
            additionalProperties: false,
            properties: {
              from: { type: 'string', required: true },
              body: { type: 'string', required: true },
            },
          },
        },
      },
      render: (_args, value) => {
        if (value.status === 'reply' && value.reply !== undefined) {
          return [{ type: 'text', text: `p2p_send_and_wait: 回复来自 ${value.reply.from}：${value.reply.body}` }]
        }
        return [{ type: 'text', text: `p2p_send_and_wait: ${value.status}` }]
      },
    },
    async execute(args): Promise<{ status: 'reply' | 'timeout' | 'queued'; reply?: { from: string; body: string } }> {
      return p2p.sendAndWait(args.target, args.body)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'p2p_check_inbox',
    description: 'List LAN peer messages the AI has not read yet. Reading does not clear the human unread badge.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          messages: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                from: { type: 'string', required: true },
                body: { type: 'string', required: true },
                ts: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        if (value.messages.length === 0) {
          return [{ type: 'text', text: 'p2p_check_inbox: 0 条消息' }]
        }
        return [{ type: 'text', text: value.messages.map(m => `[${m.from}] ${m.body}`).join('\n') }]
      },
    },
    async execute() {
      const messages = p2p.checkInbox()
      return { messages: messages.map(m => ({ id: m.id, from: m.from.name, body: m.body, ts: m.ts })) }
    },
  }))
}
