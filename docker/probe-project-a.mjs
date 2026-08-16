// Deterministic project-request probe: bypass the LLM agent and drive
// sendAndWait directly against node A, so we can tell whether a timeout is
// A-side or was just the headless LLM sender stalling.
import { Transport } from '/root/.dsh/profiles/node/node_modules/@rellopn/dsh-p2p-lan/lib/types/transport.js'
import { Discovery } from '/root/.dsh/profiles/node/node_modules/@rellopn/dsh-p2p-lan/lib/types/discovery.js'
import { Store } from '/root/.dsh/profiles/node/node_modules/@rellopn/dsh-p2p-lan/lib/types/store.js'
import { Agent } from '/root/.dsh/profiles/node/node_modules/@rellopn/dsh-p2p-lan/lib/types/agent.js'
import { createIdentity } from '/root/.dsh/profiles/node/node_modules/@rellopn/dsh-p2p-lan/lib/types/identity.js'

const identity = createIdentity('sender')
const transport = new Transport({ port: 53420 })
const discovery = new Discovery({
  identity,
  capabilities: [],
  host: 'p2p-sender',
  port: 53420,
  autoDiscover: false,
  manualPeers: [{ name: 'A', host: 'p2p-a', port: 53420 }],
})
const store = new Store(transport)
const replyEngine = { async draftReply() { return { needsGate: true, body: '' } } }
const agent = new Agent(identity, store, discovery, replyEngine, { sendWaitTimeoutMs: 90_000 })

transport.start()
discovery.start()
transport.on('envelope', (envelope) => { void agent.handleInbound(envelope) })

const t0 = Date.now()
const result = await agent.sendAndWait(
  { name: 'A', project: 'demo-a' },
  '请用 bash 工具读取当前工作目录下的 number.txt 文件内容，然后把文件内容原样回复',
)
console.log('ELAPSED_MS=' + String(Date.now() - t0))
console.log('STATUS=' + result.status)
if (result.status === 'reply') {
  console.log('REPLY_BODY=' + JSON.stringify(result.reply.body))
}
await transport.stop()
process.exit(result.status === 'reply' ? 0 : 2)
