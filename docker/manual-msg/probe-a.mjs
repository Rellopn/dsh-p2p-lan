// Peer A: no auto-discovery, knows B via manual peer; sends a message and
// verifies the round-trip (B auto-replies).
import { Transport } from '../../lib/types/transport.js'
import { Discovery } from '../../lib/types/discovery.js'
import { Store } from '../../lib/types/store.js'
import { Agent } from '../../lib/types/agent.js'
import { createIdentity } from '../../lib/types/identity.js'

const MY_PORT = Number(process.env.MY_PORT ?? 53410)
const PEER_HOST = process.env.PEER_HOST ?? '127.0.0.1'
const PEER_PORT = Number(process.env.PEER_PORT ?? 53420)

const identity = createIdentity('node-a')
const transport = new Transport({ port: MY_PORT })
const discovery = new Discovery({
  identity, capabilities: [], host: '0.0.0.0', port: MY_PORT,
  autoDiscover: false,
  manualPeers: [{ name: 'node-b', host: PEER_HOST, port: PEER_PORT }],
  projects: [],
})
const store = new Store(transport)
const replyEngine = { async draftReply() { return { needsGate: true, body: '' } } }
const agent = new Agent(identity, store, discovery, replyEngine, { sendWaitTimeoutMs: 15_000 })

const bound = await transport.start()
discovery.setAdvertisedPort(bound)
discovery.start()
transport.on('envelope', (envelope) => { void agent.handleInbound(envelope) })

console.log(`[A] listening ${bound}; manual peer node-b@${PEER_HOST}:${PEER_PORT}; autoDiscover=false`)
console.log(`[A] directory peers: ${discovery.peers().map(p => `${p.name}@${p.host}:${p.port}`).join(',') || '(none)'}`)

const started = Date.now()
const result = await agent.sendAndWait({ name: 'node-b' }, 'hello from A, please reply')
console.log(`[A] STATUS=${result.status} ELAPSED_MS=${Date.now() - started}`)
if (result.status === 'reply') console.log(`[A] REPLY from ${result.reply.from.name}: ${result.reply.body}`)
process.exit(result.status === 'reply' ? 0 : 3)
