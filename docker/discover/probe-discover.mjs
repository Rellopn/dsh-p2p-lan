// Discovery verification: run a node with autoDiscover=true and report which
// peers the UDP multicast beacon finds. Two instances on a network that
// forwards multicast (host network / real L2) should discover each other.
import { Transport } from '/opt/sim/lib/types/transport.js'
import { Discovery, detectLanAddress } from '/opt/sim/lib/types/discovery.js'

const role = process.env.ROLE ?? 'A'
const PORT = Number(process.env.PORT ?? (role === 'A' ? 53420 : 53430))

const identity = { id: 'node-' + role + '-uuid', name: 'node-' + role }
const transport = new Transport({ port: PORT })
const discovery = new Discovery({
  identity,
  capabilities: ['test'],
  host: detectLanAddress() ?? '127.0.0.1',
  port: PORT,
  autoDiscover: true,
  manualPeers: [],
  projects: [],
})

const bound = await transport.start()
discovery.setAdvertisedPort(bound)
discovery.start()

discovery.on('peer-online', (peer) => {
  console.log(`[${role}] PEER_ONLINE ${peer.name}@${peer.host}:${peer.port}`)
})
discovery.on('name-conflict', (a) => console.log(`[${role}] NAME_CONFLICT ${a.name}`))

await new Promise((resolve) => setTimeout(resolve, 8000))
const peers = discovery.peers()
console.log(`[${role}] PEERS=${peers.map(p => `${p.name}@${p.host}:${p.port}`).join(',') || '(none)'}`)
console.log(`[${role}] ANNOUNCE_HOST=${discovery && 'see-below'}`)
await transport.stop()
process.exit(peers.length > 0 ? 0 : 3)
