// WSL-sim verification: the "WSL node" behind a port-forward relay.
// Listens on RECV_PORT, auto-replies to everything (no LLM needed).
// It must KNOW the sender (manual peer, like a WSL node configured with the
// colleague's LAN address) — replies are new outbound connections.
// Imports resolve from the repo's own compiled modules, so this runs both
// locally and inside a container.
import { Transport } from '../../lib/types/transport.js'
import { Discovery } from '../../lib/types/discovery.js'
import { Store } from '../../lib/types/store.js'
import { Agent } from '../../lib/types/agent.js'
import { createIdentity } from '../../lib/types/identity.js'

const PORT = Number(process.env.RECV_PORT ?? 53420)
// Reply route: the sender's address (required; replies are outbound connects).
const PEER_NAME = process.env.PEER_NAME ?? 'R'
const PEER_HOST = process.env.PEER_HOST ?? '127.0.0.1'
const PEER_PORT = Number(process.env.PEER_PORT ?? 54900)

const identity = createIdentity('S')
const transport = new Transport({ port: PORT })
const discovery = new Discovery({
  identity,
  capabilities: [],
  host: '0.0.0.0',
  port: PORT,
  autoDiscover: false,
  manualPeers: [{ name: PEER_NAME, host: PEER_HOST, port: PEER_PORT }],
  projects: [],
})
const store = new Store(transport)
const replyEngine = {
  async draftReply(envelope) {
    return { needsGate: false, body: `reply-from-S[${envelope.body}]` }
  },
}
const agent = new Agent(identity, store, discovery, replyEngine, { sendWaitTimeoutMs: 60_000 })

const bound = await transport.start()
discovery.setAdvertisedPort(bound)
discovery.start()
transport.on('envelope', (envelope) => { void agent.handleInbound(envelope) })
console.log(`S_LISTENING=${bound} S_REPLIES_TO=${PEER_NAME}@${PEER_HOST}:${PEER_PORT}`)

// Stay up long enough for the sender probes to run, then exit.
await new Promise((resolve) => setTimeout(resolve, 90_000))
await transport.stop()
process.exit(0)