/** Cordis plugin wiring for LAN P2P collaboration. @module @rellopn/dsh-p2p-lan */

import { randomUUID } from 'node:crypto'
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
import { createLlmReplyEngine } from './reply-engine.ts'
import { Store } from './store.ts'
import { Transport } from './transport.ts'
import { mergeWorkspaces, normalizeProjects, validProjects, type ManualPeer, type ProjectEntry, type Sensitivity } from './config.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    p2p: P2PService
  }
}

export const name = 'p2p-lan'
export const inject = ['tools', 'llm']

/** Plugin configuration. */
export interface Config {
  nodeName: string
  capabilities: string[]
  autoDiscover: boolean
  manualPeers: ManualPeer[]
  port: number
  sensitivity: Sensitivity
  sendWaitTimeoutMs: number
  provider: string
  model: string
  persona: string
  projects: ProjectEntry[]
}

export const Config: z<Config> = z.object({
  nodeName: z.string().default('unnamed'),
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
})

/** The composed P2P node, provided as `ctx.p2p` and remoted to the client as `remote.p2p`. */
export class P2PService extends TypertRemoteService {
  readonly identity: NodeIdentity
  readonly discovery: Discovery
  readonly transport: Transport
  readonly store: Store
  readonly agent: Agent
  /** Authoritative project-table source (settings-resolved, incl. in-progress rows). */
  private projectsSource: () => ProjectEntry[] = () => []
  /** Durably persist the project table (settings replace). */
  private projectsPersist: (projects: ProjectEntry[]) => Promise<void> = async () => {}

  constructor(ctx: Context, config: Config) {
    super(ctx, 'p2p')
    const projects = normalizeProjects(config.projects)
    this.identity = createIdentity(config.nodeName)
    const host = detectLanAddress() ?? '127.0.0.1'
    this.transport = new Transport({ port: config.port })
    this.discovery = new Discovery({
      identity: this.identity,
      capabilities: config.capabilities,
      host,
      port: config.port,
      autoDiscover: config.autoDiscover,
      manualPeers: config.manualPeers,
      projects,
    })
    this.store = new Store(this.transport)
    const replyEngine = createLlmReplyEngine(this.ctx, {
      provider: config.provider,
      model: config.model,
      sensitivity: config.sensitivity,
      persona: config.persona,
    })
    const startProjectTask = async (project: ProjectEntry, body: string): Promise<string> => {
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
        const sessionId = SessionId(`session-${randomUUID()}`)
        const { agent } = await agents.create({
          sessionId,
          meta: { cwd: project.path },
          agentOptions: { provider: selection.provider, model: selection.model },
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
      } catch (error) {
        this.ctx.logger.warn('p2p-lan: startProjectTask failed')
        this.ctx.logger.warn(error)
        return ''
      }
    }
    this.agent = new Agent(this.identity, this.store, this.discovery, replyEngine, {
      sendWaitTimeoutMs: config.sendWaitTimeoutMs,
      projects,
      startProjectTask,
    })

    this.transport.on('envelope', (envelope: Envelope) => {
      void this.agent.handleInbound(envelope)
    })
    this.discovery.on('peer-online', () => {
      void this.store.flush()
    })

    this.ctx.effect(() => {
      this.transport.start()
      this.discovery.start()
      return () => {
        void this.transport.stop()
        this.discovery.stop()
      }
    }, 'p2p-lan: transport + discovery lifecycle')
  }

  @Remote('peers')
  peers(): PeerInfo[] {
    return this.discovery.peers()
  }

  @Remote('checkInbox')
  checkInbox(): Envelope[] {
    return this.agent.checkInbox()
  }

  @Remote('gateSnapshot')
  gateSnapshot(): Array<GateItem & { id: string }> {
    return this.agent.gateSnapshot()
  }

  @Remote('approveGate')
  async approveGate(id: string, finalBody?: string): Promise<{ ok: boolean }> {
    await this.agent.approveGate(id, finalBody)
    return { ok: true }
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

  async send(target: SendTarget, body: string): Promise<'delivered' | 'queued' | 'offline'> {
    return this.agent.send(target, body)
  }

  /** Wire the settings-resolved project source + persistence into the service. */
  attachProjectsBridge(
    source: () => ProjectEntry[],
    persist: (projects: ProjectEntry[]) => Promise<void>,
  ): void {
    this.projectsSource = source
    this.projectsPersist = persist
  }

  /** Replace the actionable project table + announced names (used by live settings edits). */
  updateProjects(projects: ProjectEntry[]): void {
    const valid = validProjects(projects)
    this.discovery.setProjects(valid.filter(entry => entry.broadcast).map(entry => entry.name))
    this.agent.setProjects(valid)
  }
}

export function apply(ctx: Context, config: Config): void {
  const p2p = new P2PService(ctx, config)

  // Live settings: the static `projects` config is the base; a settings
  // namespace layers user toggles (add/remove/edit + broadcast) on top. The
  // dsh configuration-client boundary only exposes an allowlisted set of
  // namespaces, so the browser reads/writes this one through the P2P remote
  // (getProjects/setProjects) instead of settingsScope; the namespace stays the
  // durable store of record Host-side.
  const projectsSchema = z.object({
    projects: z.array(z.object({
      name: z.string(),
      path: z.string(),
      broadcast: z.boolean().default(false),
    })),
  })
  const fallback = (): { projects: ProjectEntry[] } => ({ projects: config.projects })
  let projectsScope: SettingsScope<{ projects: ProjectEntry[] }> | undefined
  const source = (): { projects: ProjectEntry[] } => (projectsScope === undefined ? fallback() : projectsScope.get())
  ctx.inject(['settings'], (sctx) => {
    projectsScope = sctx.settings.register(settingsNamespace('p2p'), projectsSchema, {
      base: { projects: config.projects },
    })
    p2p.updateProjects(source().projects)
    projectsScope.watch(() => {
      p2p.updateProjects(source().projects)
    })
  })
  p2p.attachProjectsBridge(
    () => source().projects,
    async (projects) => {
      if (projectsScope === undefined) return
      await projectsScope.replace({ projects })
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
      const result = await p2p.agent.sendAndWait(args.target, args.body)
      if (result.status === 'reply') {
        return { status: 'reply', reply: { from: result.reply.from.name, body: result.reply.body } }
      }
      return { status: result.status }
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
