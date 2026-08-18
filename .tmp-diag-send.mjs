// Diagnostic: send a request to the running sr-wsl node (127.0.0.1:53424)
// from an UNKNOWN sender — exactly the reported scenario. Watch web.log for
// the p2p-lan gate/log line afterwards.
import { Transport } from '/home/rellopn/.dsh/profiles/web/node_modules/@rellopn/dsh-p2p-lan/lib/types/transport.js'

const t = new Transport({ port: 53440 })
await t.start()
await t.send({ host: '127.0.0.1', port: 53424 }, {
  id: 'diag-' + Date.now(),
  kind: 'request',
  from: { id: 'diag-probe', name: '诊断探针' },
  to: { name: 'sr-wsl' },
  body: '诊断测试消息：无需执行，仅验证入站路由日志。',
  ts: Date.now(),
})
console.log('SENT_TO_53424')
await t.stop()
process.exit(0)