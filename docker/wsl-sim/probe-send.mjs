// WSL-sim verification: remote peer that only knows the *relay address*
// (the Windows host's LAN IP + forwarded port). Fixes its own listen port so
// the WSL node can reply to it. Args: relayHost relayPort [reply|fail]
//   reply - expects a successful round-trip through the relay
//   fail  - expects no reply (e.g. wrong/unreachable address in manual config)
import { Transport } from '../../lib/types/transport.js'
import { Discovery } from '../../lib/types/discovery.js'
import { Store } from '../../lib/types/store.js'
import { Agent } from '../../lib/types/agent.js'
import { createIdentity } from '../../lib/types/identity.js'

const relayHost = process.argv[2] ?? '127.0.0.1'
const relayPort = Number(process.argv[3] ?? 53421)
const mode = process.argv[4] ?? 'reply'
const expectReply = mode !== 'fail'
const SEND_PORT = Number(process.env.SEND_PORT ?? 54900)

const identity = createIdentity('R')
const transport = new Transport({ port: SEND_PORT })
const discovery = new Discovery({
  identity,
  capabilities: [],
  host: '0.0.0.0',
  port: SEND_PORT,
  autoDiscover: false,
  manualPeers: [{ name: 'S', host: relayHost, port: relayPort }],
  projects: [],
})
const store = new Store(transport)
const replyEngine = { async draftReply() { return { needsGate: true, body: '' } } }
const agent = new Agent(identity, store, discovery, replyEngine, { sendWaitTimeoutMs: 30_000 })

const bound = await transport.start()
discovery.setAdvertisedPort(bound)
discovery.start()
transport.on('envelope', (envelope) => { void agent.handleInbound(envelope) })

const t0 = Date.now()
const result = await agent.sendAndWait({ name: 'S' }, 'ping-' + Date.now())
const gotReply = result.status === 'reply'
const elapsed = Date.now() - t0
console.log(`SEND_TARGET=${relayHost}:${relayPort} MODE=${mode} STATUS=${result.status} ELAPSED_MS=${elapsed}`)
if (gotReply) console.log('REPLY_BODY=' + JSON.stringify(result.reply.body))

await transport.stop()
process.exit(gotReply === expectReply ? 0 : 2)