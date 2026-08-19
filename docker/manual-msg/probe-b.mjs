// Peer B: listens, no auto-discovery, knows A via manual peer, auto-replies.
import { Transport } from '../../lib/types/transport.js'
import { Discovery } from '../../lib/types/discovery.js'
import { Store } from '../../lib/types/store.js'
import { Agent } from '../../lib/types/agent.js'
import { createIdentity } from '../../lib/types/identity.js'

const MY_PORT = Number(process.env.MY_PORT ?? 53420)
const PEER_HOST = process.env.PEER_HOST ?? '127.0.0.1'
const PEER_PORT = Number(process.env.PEER_PORT ?? 53410)

const identity = createIdentity('node-b')
const transport = new Transport({ port: MY_PORT })
const discovery = new Discovery({
  identity, capabilities: [], host: '0.0.0.0', port: MY_PORT,
  autoDiscover: false,
  manualPeers: [{ name: 'node-a', host: PEER_HOST, port: PEER_PORT }],
  projects: [],
})
const store = new Store(transport)
const replyEngine = { async draftReply() { return { needsGate: false, body: 'reply-from-B' } } }
const agent = new Agent(identity, store, discovery, replyEngine, { sendWaitTimeoutMs: 20_000 })

const bound = await transport.start()
discovery.setAdvertisedPort(bound)
discovery.start()
transport.on('envelope', (envelope) => { void agent.handleInbound(envelope) })

console.log(`[B] listening ${bound}; manual peer node-a@${PEER_HOST}:${PEER_PORT}; autoDiscover=false`)
console.log(`[B] directory peers: ${discovery.peers().map(p => `${p.name}@${p.host}:${p.port}`).join(',') || '(none)'}`)
await new Promise(r => setTimeout(r, 30_000))
process.exit(0)
