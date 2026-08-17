import { Transport } from '/root/.dsh/profiles/node/node_modules/@rellopn/dsh-p2p-lan/lib/types/transport.js'
import { Discovery } from '/root/.dsh/profiles/node/node_modules/@rellopn/dsh-p2p-lan/lib/types/discovery.js'
import { Store } from '/root/.dsh/profiles/node/node_modules/@rellopn/dsh-p2p-lan/lib/types/store.js'
import { Agent } from '/root/.dsh/profiles/node/node_modules/@rellopn/dsh-p2p-lan/lib/types/agent.js'
import { createIdentity } from '/root/.dsh/profiles/node/node_modules/@rellopn/dsh-p2p-lan/lib/types/identity.js'

const target = process.env.TARGET ?? 'B'
const body = process.env.BODY ?? 'hello'

const identity = createIdentity('sender')
const transport = new Transport({ port: 53420 })
const discovery = new Discovery({
  identity,
  capabilities: [],
  host: 'p2p-sender',
  port: 53420,
  autoDiscover: false,
  manualPeers: [{ name: target, host: `p2p-${target.toLowerCase()}`, port: 53420 }],
})
const store = new Store(transport)
const replyEngine = { async draftReply() { return { needsGate: true, body: '' } } }
const agent = new Agent(identity, store, discovery, replyEngine, { sendWaitTimeoutMs: 90_000 })

const actualPort = await transport.start()
discovery.setAdvertisedPort(actualPort)
discovery.start()
transport.on('envelope', (envelope) => { void agent.handleInbound(envelope) })

const result = await agent.sendAndWait({ name: target }, body)
console.log('STATUS=' + result.status)
if (result.status === 'reply') {
  console.log('REPLY_BODY=' + JSON.stringify(result.reply.body))
}
await transport.stop()
process.exit(result.status === 'reply' ? 0 : 2)
