// End-to-end scenario suite: two REAL nodes (Transport over WebSocket +
// Discovery + Store + Agent) in one container, driving every message situation
// and asserting outcomes. Exit 0 only when every scenario passes.
import { Transport } from '/opt/sim/lib/types/transport.js'
import { Discovery } from '/opt/sim/lib/types/discovery.js'
import { Store } from '/opt/sim/lib/types/store.js'
import { Agent } from '/opt/sim/lib/types/agent.js'
import { createIdentity } from '/opt/sim/lib/types/identity.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
let failed = 0
function report(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

// --- Node B: behavior routed by message-body tag ---
//   [auto]     immediate auto-reply
//   [slow]     auto-reply after a delay (> A's quick window)
//   [gate]     force human gate with a draft
//   [silent]   force gate with EMPTY draft (AI-failure shape)
//   [proj*]    project-routed (auto or gated by tag)
async function makeNode({ name, port, peers, quickWaitMs, sendWaitTimeoutMs, projects, startProjectTask, slowReplyMs = 0 }) {
  const identity = createIdentity(name)
  const transport = new Transport({ port })
  const discovery = new Discovery({
    identity, capabilities: [], host: '127.0.0.1', port,
    autoDiscover: false, manualPeers: peers, projects: projects ?? [],
  })
  const store = new Store(transport)
  const replyEngine = {
    async draftReply(envelope) {
      if (envelope.body.startsWith('[slow]')) {
        await sleep(slowReplyMs)
        return { needsGate: false, body: 'slow-reply:' + envelope.body }
      }
      if (envelope.body.startsWith('[auto]')) return { needsGate: false, body: 'auto-reply:' + envelope.body }
      if (envelope.body.startsWith('[silent]')) return { needsGate: true, body: '' }
      if (envelope.body.startsWith('[gate]')) return { needsGate: true, body: 'draft-reply' }
      return { needsGate: false, body: 'auto-reply:' + envelope.body }
    },
  }
  const agent = new Agent(identity, store, discovery, replyEngine, {
    sendWaitTimeoutMs, quickWaitMs,
    projects: projects ?? [],
    startProjectTask,
  })
  const bound = await transport.start()
  discovery.setAdvertisedPort(bound)
  discovery.start()
  transport.on('envelope', (envelope) => { void agent.handleInbound(envelope) })
  return { name, transport, discovery, agent, bound }
}

/** Resolve the NEXT wait-settled event for one specific requestId. */
function nextSettledFor(agent, requestId, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs)
    const onSettled = (e) => {
      if (e.requestId !== requestId) return
      clearTimeout(timer)
      agent.removeListener('wait-settled', onSettled)
      resolve(e)
    }
    agent.on('wait-settled', onSettled)
  })
}

async function main() {
  // ---------- nodes ----------
  const ranProjects = []
  const A = await makeNode({
    name: 'A', port: 53500,
    peers: [{ name: 'B', host: '127.0.0.1', port: 53520 }],
    quickWaitMs: 400, sendWaitTimeoutMs: 3500,
  })
  const B = await makeNode({
    name: 'B', port: 53520,
    peers: [{ name: 'A', host: '127.0.0.1', port: 53500 }],
    quickWaitMs: 400, sendWaitTimeoutMs: 3500,
    slowReplyMs: 1200,
    projects: [{ name: 'demo', path: '/tmp/demo', broadcast: false }],
    startProjectTask: async (project, body) => {
      ranProjects.push(`${project.name}:${body}`)
      return 'PROJECT_RESULT:' + body
    },
  })
  await sleep(300)

  // ---------- S1 manual discovery both ways ----------
  report('S1 manual discovery: A sees B', A.discovery.peers().some(p => p.name === 'B'))
  report('S1 manual discovery: B sees A', B.discovery.peers().some(p => p.name === 'A'))

  // ---------- S2 quick-window reply ----------
  {
    const r = await A.agent.sendAndWait({ name: 'B' }, '[auto] hello')
    report('S2 reply within quick window', r.status === 'reply' && r.reply.body.includes('auto-reply'), JSON.stringify(r.status))
  }

  // ---------- S3 pending -> background reply delivered ----------
  {
    const r = await A.agent.sendAndWait({ name: 'B' }, '[slow] take your time')
    const pendingOk = r.status === 'pending'
    const settled = pendingOk && r.status === 'pending'
      ? await nextSettledFor(A.agent, r.requestId)
      : undefined
    const ok = pendingOk && settled !== undefined && settled.result.status === 'reply'
      && settled.result.reply.body.includes('slow-reply')
    report('S3 quick-window timeout -> pending, reply delivered via wait-settled', ok,
      ok ? `requestId=${settled.requestId.slice(0, 8)}…` : `status=${r.status} settled=${settled === undefined ? 'none' : settled.result.status}`)
  }

  // ---------- S4 pending -> background total timeout ----------
  {
    const r = await A.agent.sendAndWait({ name: 'B' }, '[silent] never drafted')
    const pendingOk = r.status === 'pending'
    const settled = pendingOk && r.status === 'pending'
      ? await nextSettledFor(A.agent, r.requestId, 6000)
      : undefined
    report('S4 pending -> wait-settled timeout', pendingOk && settled !== undefined && settled.result.status === 'timeout',
      `status=${r.status}`)
  }

  // ---------- S5 broadcast lands in inbox + gate (no auto reply) ----------
  {
    await A.agent.send({ broadcast: true }, '[gate] broadcast probe')
    await sleep(400)
    const inInbox = B.agent.inboxSnapshot().some(e => e.body.includes('broadcast probe'))
    const inGate = B.agent.gateSnapshot().some(g => g.original.body.includes('broadcast probe'))
    report('S5 broadcast -> inbox + gate on B (never auto-replied)', inInbox && inGate, `inbox=${inInbox} gate=${inGate}`)
    // clean up the gate so later scenarios are unaffected
    for (const g of B.agent.gateSnapshot()) B.agent.rejectGate(g.id)
  }

  // ---------- S6 unknown sender gated with a warning path ----------
  {
    const C = await makeNode({
      name: 'stranger', port: 53540,
      peers: [{ name: 'B', host: '127.0.0.1', port: 53520 }],
      quickWaitMs: 200, sendWaitTimeoutMs: 800,
    })
    await C.agent.send({ name: 'B' }, '[gate] who am I')
    await sleep(300)
    const gate = B.agent.gateSnapshot().find(g => g.original.body.includes('who am I'))
    const known = B.discovery.peers().some(p => p.name === 'stranger')
    report('S6 unknown sender -> gated (not silently inboxed)', gate !== undefined && !known, `gate=${gate !== undefined} known=${known}`)
    if (gate !== undefined) B.agent.rejectGate(gate.id)
    await C.transport.stop()
  }

  // ---------- S7 project auto run ----------
  {
    const r = await A.agent.sendAndWait({ name: 'B', project: 'demo' }, '[proj] run it')
    // [proj] does not match reply tags -> default auto -> project path executes
    const ok = r.status === 'reply' && r.reply.body.includes('PROJECT_RESULT')
    report('S7 project request auto-executes and replies with result', ok, JSON.stringify(r.status))
  }

  // ---------- S8 project gated -> approve runs in background ----------
  {
    await A.agent.send({ name: 'B', project: 'demo' }, '[gate] proj gated run')
    await sleep(300)
    const gate = B.agent.gateSnapshot().find(g => g.original.body.includes('proj gated run'))
    if (gate === undefined) {
      report('S8 gated project -> approve runs in background', false, 'gate not created')
    } else {
      const t0 = Date.now()
      const ok = await B.agent.approveGate(gate.id)
      const immediate = Date.now() - t0 < 300
      const reply = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(undefined), 4000)
        A.transport.on('envelope', () => {})
        const poll = setInterval(() => {
          if (A.agent.inboxSnapshot().some(e => e.body.includes('PROJECT_RESULT:'))) {
            clearInterval(poll); clearTimeout(timer); resolve(true)
          }
        }, 100)
      })
      report('S8 gated project -> approve returns immediately, result delivered later',
        ok && immediate && reply === true, `ok=${ok} immediate=${immediate}ms reply=${reply === true}`)
    }
  }

  // ---------- S9 gate edit-then-send ----------
  {
    await A.agent.send({ name: 'B' }, '[gate] edit me')
    await sleep(250)
    const gate = B.agent.gateSnapshot().find(g => g.original.body.includes('edit me'))
    if (gate === undefined) {
      report('S9 gate edit flow', false, 'gate not created')
    } else {
      const got = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(undefined), 3000)
        const poll = setInterval(() => {
          if (A.agent.inboxSnapshot().some(e => e.body === 'EDITED_BODY')) {
            clearInterval(poll); clearTimeout(timer); resolve(true)
          }
        }, 100)
      })
      await B.agent.approveGate(gate.id, 'EDITED_BODY')
      // wait a moment for delivery
      await sleep(400)
      const delivered = A.agent.inboxSnapshot().some(e => e.body === 'EDITED_BODY')
      report('S9 gate edited reply delivered', delivered, `got=${got} delivered=${delivered}`)
    }
  }

  // ---------- S10 reject sends nothing ----------
  {
    await A.agent.send({ name: 'B' }, '[gate] reject me')
    await sleep(250)
    const gate = B.agent.gateSnapshot().find(g => g.original.body.includes('reject me'))
    if (gate === undefined) {
      report('S10 gate reject sends nothing', false, 'gate not created')
    } else {
      B.agent.rejectGate(gate.id)
      await sleep(700)
      const leaked = A.agent.inboxSnapshot().some(e => e.body === 'draft-reply')
      report('S10 gate rejected -> no reply leaked', !leaked, `leaked=${leaked}`)
    }
  }

  // ---------- S11 port walk on busy ----------
  {
    const t = new Transport({ port: 53500 })
    const bound = await t.start()
    report('S11 busy port walks to next free port', bound !== 53500 && bound > 53500, `bound=${bound}`)
    await t.stop()
  }

  // ---------- S12 offline target queues ----------
  {
    const r = await A.agent.sendAndWait({ name: 'nobody' }, '[auto] anyone?')
    report('S12 unknown target -> queued (offline)', r.status === 'queued', JSON.stringify(r.status))
  }

  // ---------- S13 multiple background waits each settle, none left behind ----------
  {
    const settleFor = async () => {
      const r = await A.agent.sendAndWait({ name: 'B' }, '[slow] bg one')
      if (r.status !== 'pending') return { ok: r.status === 'reply', detail: `direct ${r.status}` }
      const settled = await nextSettledFor(A.agent, r.requestId)
      return { ok: settled !== undefined && settled.result.status === 'reply', detail: `settled=${settled?.result.status}` }
    }
    const first = await settleFor()
    const second = await settleFor()
    report('S13 multiple background waits settle, none left behind',
      first.ok && second.ok && A.agent.pendingWaits() === 0,
      `first=${first.detail} second=${second.detail} pendingLeft=${A.agent.pendingWaits()}`)
  }

  // ---------- summary ----------
  console.log('---')
  console.log(`TOTAL ${results.length - failed}/${results.length} passed`)
  await A.transport.stop()
  await B.transport.stop()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => { console.error('E2E crashed:', err); process.exit(2) })
