import { clientBundle } from './scripts/tsdown.client.ts'

export default clientBundle(
  '@rellopn/dsh-p2p-lan',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true },
)
