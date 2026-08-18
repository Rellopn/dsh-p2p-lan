// WSL-sim verification: the port-forward relay (stands in for Windows' portproxy
// / socat: exposes LAN_PORT on the shared network and forwards to the isolated
// "WSL" node's TARGET_HOST:TARGET_PORT).
// Usage: node relay.mjs <listenPort> <targetHost> <targetPort>
import { createServer, connect } from 'node:net'

const listenPort = Number(process.argv[2] ?? 53421)
const targetHost = process.argv[3] ?? '127.0.0.1'
const targetPort = Number(process.argv[4] ?? 53420)

const server = createServer((client) => {
  const upstream = connect(targetPort, targetHost, () => {
    client.pipe(upstream)
    upstream.pipe(client)
  })
  client.on('error', () => upstream.destroy())
  upstream.on('error', () => client.destroy())
})
server.listen(listenPort, '0.0.0.0', () => {
  console.log(`RELAY_LISTENING=${listenPort} -> ${targetHost}:${targetPort}`)
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))