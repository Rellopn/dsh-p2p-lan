import { describe, expect, it } from 'vitest'
import type { PeerInfo } from '../src/discovery.ts'
import { MAX_REPLY_DEPTH } from '../src/messages.ts'
import type { Envelope } from '../src/messages.ts'
import { Store, type TransportLike } from '../src/store.ts'
import { Agent, type PeerDirectory, type ReplyEngine } from '../src/agent.ts'

interface Recording {
  transport: TransportLike
  sent: Array<{ peer: { host: string; port: number }; envelope: Envelope }>
}

function recordingTransport(): Recording {
  const sent: Recording['sent'] = []
  return {
    sent,
    transport: {
      send: async (peer, envelope) => {
        sent.push({ peer, envelope })
      },
    },
  }
}

function peer(id: string, name: string, port: number): PeerInfo {
  return { id, name, capabilities: [], projects: [], host: '127.0.0.1', port, lastSeen: Date.now(), manual: false }
}

function directory(peers: PeerInfo[]): PeerDirectory {
  return {
    resolveById: id => peers.find(p => p.id === id),
    resolveByName: name => peers.find(p => p.name === name),
    resolveByCapability: cap => peers.filter(p => p.capabilities.includes(cap)),
    peers: () => peers,
  }
}

function replyTo(request: Envelope, body: string): Envelope {
  return {
    id: `reply-${request.id}`,
    kind: 'reply',
    from: { id: 'b', name: 'node-B' },
    to: { id: 'a', name: 'node-A' },
    replyTo: request.id,
    body,
    ts: Date.now(),
  }
}

function autoEngine(body = 'auto answer'): ReplyEngine {
  return { draftReply: async () => ({ needsGate: false, body }) }
}

function gateEngine(body = 'draft answer'): ReplyEngine {
  return { draftReply: async () => ({ needsGate: true, body }) }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('agent sendAndWait', () => {
  it('resolves with the reply when it arrives', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([peer('b', 'node-B', 13000)]), autoEngine())

    const waiting = agent.sendAndWait({ name: 'node-B' }, 'need interface')
    await sleep(20)
    const request = rec.sent[0]?.envelope
    expect(request?.kind).toBe('request')

    await agent.handleInbound(replyTo(request!, 'here it is'))
    const result = await waiting
    expect(result.status).toBe('reply')
    if (result.status === 'reply') expect(result.reply.body).toBe('here it is')
  })

  it('times out when no reply arrives', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([peer('b', 'node-B', 13000)]), autoEngine(), { sendWaitTimeoutMs: 100 })

    const result = await agent.sendAndWait({ name: 'node-B' }, 'need interface')
    expect(result.status).toBe('timeout')
  })

  it('returns queued immediately when the peer is offline', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([]), autoEngine())

    const result = await agent.sendAndWait({ name: 'node-B' }, 'need interface')
    expect(result.status).toBe('queued')
  })
})

describe('agent inbound routing', () => {
  it('auto-replies to a request', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([peer('b', 'node-B', 13000)]), autoEngine('auto answer'))

    const request: Envelope = {
      id: 'req1', kind: 'request', from: { id: 'b', name: 'node-B' }, to: { id: 'a', name: 'node-A' }, body: 'question', ts: Date.now(),
    }
    await agent.handleInbound(request)

    const reply = rec.sent.find(s => s.envelope.kind === 'reply')
    expect(reply?.envelope.body).toBe('auto answer')
    expect(reply?.envelope.replyTo).toBe('req1')
    expect(reply?.envelope.auto).toBe(true)
  })

  it('gates a request and sends only after approval', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([peer('b', 'node-B', 13000)]), gateEngine('draft answer'))
    const gateEvents: string[] = []
    agent.on('gate-required', (e: { id: string }) => gateEvents.push(e.id))

    const request: Envelope = {
      id: 'req2', kind: 'request', from: { id: 'b', name: 'node-B' }, to: { id: 'a', name: 'node-A' }, body: 'confirm contract', ts: Date.now(),
    }
    await agent.handleInbound(request)

    expect(gateEvents).toEqual(['req2'])
    expect(agent.gateSnapshot()).toHaveLength(1)
    expect(rec.sent.find(s => s.envelope.kind === 'reply')).toBeUndefined()

    await agent.approveGate('req2', 'edited answer')
    const reply = rec.sent.find(s => s.envelope.kind === 'reply')
    expect(reply?.envelope.body).toBe('edited answer')
    expect(agent.gateSnapshot()).toHaveLength(0)
  })

  it('rejectGate discards the draft without sending', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([peer('b', 'node-B', 13000)]), gateEngine())

    const request: Envelope = {
      id: 'req3', kind: 'request', from: { id: 'b', name: 'node-B' }, to: { id: 'a', name: 'node-A' }, body: 'x', ts: Date.now(),
    }
    await agent.handleInbound(request)
    agent.rejectGate('req3')
    expect(agent.gateSnapshot()).toHaveLength(0)
    expect(rec.sent.find(s => s.envelope.kind === 'reply')).toBeUndefined()
  })

  it('gates an empty auto-reply draft instead of sending an empty message', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([peer('b', 'node-B', 13000)]), autoEngine(''))
    const gateEvents: string[] = []
    agent.on('gate-required', (e: { id: string }) => gateEvents.push(e.id))

    const request: Envelope = {
      id: 'req-empty', kind: 'request', from: { id: 'b', name: 'node-B' }, to: { id: 'a', name: 'node-A' }, body: 'q', ts: Date.now(),
    }
    await agent.handleInbound(request)

    expect(gateEvents).toEqual(['req-empty'])
    expect(rec.sent.find(s => s.envelope.kind === 'reply')).toBeUndefined()
    expect(agent.gateSnapshot()[0]?.draftBody).toBe('')
  })

  it('refuses to approve a gate with an empty body and keeps the gate', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([peer('b', 'node-B', 13000)]), gateEngine(''))

    const request: Envelope = {
      id: 'req-approve-empty', kind: 'request', from: { id: 'b', name: 'node-B' }, to: { id: 'a', name: 'node-A' }, body: 'x', ts: Date.now(),
    }
    await agent.handleInbound(request)

    const ok = await agent.approveGate('req-approve-empty')
    expect(ok).toBe(false)
    expect(rec.sent.find(s => s.envelope.kind === 'reply')).toBeUndefined()
    expect(agent.gateSnapshot()).toHaveLength(1)
  })

  it('gates a project request whose session produced no answer', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent(
      { id: 'a', name: 'node-A' },
      store,
      directory([peer('b', 'node-B', 13000)]),
      autoEngine('auto answer'),
      {
        projects: [{ name: 'backend-api', path: '/home/a/api', broadcast: false }],
        startProjectTask: async () => '',
      },
    )
    const gateEvents: string[] = []
    agent.on('gate-required', (e: { id: string }) => gateEvents.push(e.id))

    const request: Envelope = {
      id: 'req-no-answer', kind: 'request', from: { id: 'b', name: 'node-B' },
      to: { id: 'a', name: 'node-A', project: 'backend-api' }, body: 'list files', ts: Date.now(),
    }
    await agent.handleInbound(request)

    expect(gateEvents).toEqual(['req-no-answer'])
    expect(rec.sent.find(s => s.envelope.kind === 'reply')).toBeUndefined()
  })
})

describe('agent project routing', () => {
  it('runs the project session on approval and replies with its result', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const started: Array<{ name: string; body: string }> = []
    const agent = new Agent(
      { id: 'a', name: 'node-A' },
      store,
      directory([peer('b', 'node-B', 13000)]),
      gateEngine('draft answer'),
      {
        projects: [{ name: 'backend-api', path: '/home/b/api', broadcast: false }],
        startProjectTask: async (project, body) => { started.push({ name: project.name, body }); return 'RESULT' },
      },
    )

    const request: Envelope = {
      id: 'req4', kind: 'request', from: { id: 'b', name: 'node-B' },
      to: { id: 'a', name: 'node-A', project: 'backend-api' }, body: 'change the api', ts: Date.now(),
    }
    await agent.handleInbound(request)
    expect(agent.gateSnapshot()).toHaveLength(1)
    expect(agent.gateSnapshot()[0]?.draftBody).toBe('')

    await agent.approveGate('req4', 'edited body')

    expect(started).toEqual([{ name: 'backend-api', body: 'change the api' }])
    const reply = rec.sent.find(s => s.envelope.kind === 'reply')
    expect(reply?.envelope.body).toBe('RESULT')
  })

  it('does not run a task for an unknown project (falls back to the draft reply)', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const started: Array<{ name: string; body: string }> = []
    const agent = new Agent(
      { id: 'a', name: 'node-A' },
      store,
      directory([peer('b', 'node-B', 13000)]),
      gateEngine('draft answer'),
      {
        projects: [{ name: 'backend-api', path: '/home/b/api', broadcast: false }],
        startProjectTask: async (project, body) => { started.push({ name: project.name, body }); return 'RESULT' },
      },
    )

    const request: Envelope = {
      id: 'req5', kind: 'request', from: { id: 'b', name: 'node-B' },
      to: { id: 'a', name: 'node-A', project: 'unknown' }, body: 'x', ts: Date.now(),
    }
    await agent.handleInbound(request)
    await agent.approveGate('req5', 'body')

    expect(started).toEqual([])
    const reply = rec.sent.find(s => s.envelope.kind === 'reply')
    expect(reply?.envelope.body).toBe('body')
  })

  it('runs the project session for a non-gated project request and replies with its result', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const started: Array<{ name: string; body: string }> = []
    const agent = new Agent(
      { id: 'a', name: 'node-A' },
      store,
      directory([peer('b', 'node-B', 13000)]),
      autoEngine('auto answer'),
      {
        projects: [{ name: 'backend-api', path: '/home/a/api', broadcast: false }],
        startProjectTask: async (project, body) => { started.push({ name: project.name, body }); return 'RESULT' },
      },
    )

    const request: Envelope = {
      id: 'req6', kind: 'request', from: { id: 'b', name: 'node-B' },
      to: { id: 'a', name: 'node-A', project: 'backend-api' }, body: 'list files', ts: Date.now(),
    }
    await agent.handleInbound(request)

    expect(started).toEqual([{ name: 'backend-api', body: 'list files' }])
    const reply = rec.sent.find(s => s.envelope.kind === 'reply')
    expect(reply?.envelope.body).toBe('RESULT')
  })

  it('does not run a task for a non-gated request without a project', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const started: Array<{ name: string; body: string }> = []
    const agent = new Agent(
      { id: 'a', name: 'node-A' },
      store,
      directory([peer('b', 'node-B', 13000)]),
      autoEngine('auto answer'),
      {
        projects: [{ name: 'backend-api', path: '/home/a/api', broadcast: false }],
        startProjectTask: async (project, body) => { started.push({ name: project.name, body }); return 'RESULT' },
      },
    )

    const request: Envelope = {
      id: 'req7', kind: 'request', from: { id: 'b', name: 'node-B' },
      to: { id: 'a', name: 'node-A' }, body: 'hello', ts: Date.now(),
    }
    await agent.handleInbound(request)

    expect(started).toEqual([])
    const reply = rec.sent.find(s => s.envelope.kind === 'reply')
    expect(reply?.envelope.body).toBe('auto answer')
  })
})

describe('agent reply rules', () => {
  it('does not auto-reply to a broadcast but surfaces a manual gate', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([peer('b', 'node-B', 13000)]), autoEngine())
    const gated: string[] = []
    agent.on('gate-required', (e: { id: string }) => gated.push(e.id))

    const broadcast: Envelope = {
      id: 'bc1', kind: 'request', from: { id: 'b', name: 'node-B' }, to: { broadcast: true }, body: 'anyone?', ts: Date.now(),
    }
    await agent.handleInbound(broadcast)
    expect(rec.sent.find(s => s.envelope.kind === 'reply')).toBeUndefined()
    expect(store.checkInbox().map(e => e.id)).toContain('bc1')
    // The broadcast must not vanish into the inbox: it becomes a visible gate
    // a human can approve (manual reply, not an auto-reply).
    expect(gated).toEqual(['bc1'])
    expect(agent.gateSnapshot().map(g => g.id)).toEqual(['bc1'])
  })

  it('gates a request from an unknown sender and refuses approval until the sender is known', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([]), autoEngine())
    const gated: string[] = []
    agent.on('gate-required', (e: { id: string }) => gated.push(e.id))

    const request: Envelope = {
      id: 'un1', kind: 'request', from: { id: 'x', name: 'node-X' }, to: { id: 'a', name: 'node-A' }, body: 'please work', ts: Date.now(),
    }
    await agent.handleInbound(request)
    expect(gated).toEqual(['un1'])
    expect(store.checkInbox().map(e => e.id)).toContain('un1')
    expect(rec.sent.length).toBe(0)

    // Approval is refused while the sender is not in the directory; gate stays open.
    const ok = await agent.approveGate('un1', 'ok')
    expect(ok).toBe(false)
    expect(agent.gateSnapshot().map(g => g.id)).toEqual(['un1'])
    expect(rec.sent.length).toBe(0)
  })

  it('still runs the project task for an unknown sender on approval (execution happens, reply cannot be sent)', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const started: string[] = []
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([]), autoEngine(), {
      projects: [{ name: 'backend-api', path: '/home/a/api', broadcast: false }],
      startProjectTask: async (project, body) => { started.push(`${project.name}:${body}`); return 'task done' },
    })

    const request: Envelope = {
      id: 'un2', kind: 'request', from: { id: 'x', name: 'node-X' },
      to: { id: 'a', name: 'node-A', project: 'backend-api' }, body: 'fix it', ts: Date.now(),
    }
    await agent.handleInbound(request)
    const ok = await agent.approveGate('un2')
    expect(ok).toBe(true)
    expect(started).toEqual(['backend-api:fix it'])
    expect(agent.gateSnapshot()).toHaveLength(0)
    // The sender is unknown, so no reply could be delivered — nothing was sent.
    expect(rec.sent.length).toBe(0)
  })

  it('emits structured log records as it routes inbound messages', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([]), autoEngine())
    const logs: Array<{ level: string; message: string }> = []
    agent.on('log', (record: { level: string; message: string }) => logs.push(record))

    const request: Envelope = {
      id: 'lg1', kind: 'request', from: { id: 'x', name: 'node-X' }, to: { id: 'a', name: 'node-A' }, body: 'hi', ts: Date.now(),
    }
    await agent.handleInbound(request)
    expect(logs.some(l => l.level === 'warn' && l.message.includes('UNKNOWN sender'))).toBe(true)
  })

  it('forces a gate when an auto chain reaches the depth limit', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([peer('b', 'node-B', 13000)]), autoEngine())
    const gated: string[] = []
    agent.on('gate-required', (e: { id: string }) => gated.push(e.id))

    const deepAuto: Envelope = {
      id: 'deep1', kind: 'request', from: { id: 'b', name: 'node-B' }, to: { id: 'a', name: 'node-A' },
      body: 'follow-up', ts: Date.now(), auto: true, depth: MAX_REPLY_DEPTH,
    }
    await agent.handleInbound(deepAuto)
    expect(gated).toEqual(['deep1'])
    expect(rec.sent.find(s => s.envelope.kind === 'reply')).toBeUndefined()
  })

  it('auto replies always carry replyTo and increment depth', async () => {
    const rec = recordingTransport()
    const store = new Store(rec.transport)
    const agent = new Agent({ id: 'a', name: 'node-A' }, store, directory([peer('b', 'node-B', 13000)]), autoEngine())

    const request: Envelope = {
      id: 'req1', kind: 'request', from: { id: 'b', name: 'node-B' }, to: { id: 'a', name: 'node-A' }, body: 'q', ts: Date.now(),
    }
    await agent.handleInbound(request)
    const reply = rec.sent.find(s => s.envelope.kind === 'reply')
    expect(reply?.envelope.replyTo).toBe('req1')
    expect(reply?.envelope.depth).toBe(1)
  })
})
