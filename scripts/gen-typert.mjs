// Regenerate the Typert artifacts (lib/typert.host.* and lib/typert.remote-client.*).
//
// In the upstream harness these are emitted by the Host tsdown phase via the
// typert tsdown plugin; this repo has no such wiring, AND `@deepseek-ai/dsh-typert-protocol`
// is an external dependency rather than a workspace package, so the analyzer cannot
// attribute `@Remote` to it and this script currently reports "has no Remote methods".
// The checked-in artifacts are therefore maintained BY HAND: when you add/remove
// @Remote methods in src/plugin.ts, sync the three files
//   lib/typert.host.js, lib/typert.remote-client.js, lib/typert.remote-client.d.ts
// (a zod schema per new/returned type + an invocation/descriptor entry + the d.ts signature).
//
// If this repo is ever folded back into a workspace that also contains
// @deepseek-ai/dsh-typert-protocol, re-enable: node scripts/gen-typert.mjs
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const generator = new WorkspaceTypertGenerator(root)
// Host face only: emits typert.host.* and the Host-for-Client remote-client.*.
const artifacts = generator.generate(['@rellopn/dsh-p2p-lan'], ['host'])

let wrote = 0
for (const artifact of artifacts) {
  if (artifact.face !== 'host') continue
  const libDir = join(resolve(root, artifact.packageRoot), 'lib')
  mkdirSync(libDir, { recursive: true })
  writeFileSync(join(libDir, 'typert.host.js'), artifact.js)
  writeFileSync(join(libDir, 'typert.host.d.ts'), artifact.dts)
  if (artifact.remote !== undefined) {
    writeFileSync(join(libDir, 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(join(libDir, 'typert.remote-client.d.ts'), artifact.remote.dts)
  }
  wrote += 1
  console.log(`typert: wrote ${artifact.package} (host${artifact.remote !== undefined ? ' + remote' : ''})`)
}
if (wrote === 0) {
  console.error('typert: no host artifacts generated')
  process.exit(1)
}
