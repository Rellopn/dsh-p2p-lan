import { defineConfig } from 'tsdown'

export default defineConfig(({ env }) => {
  const client = env?.DSH_BUILD_FACE === 'client'
  return {
    workspace: ['packages/*'],
    entry: client ? '' : ['lib/types/{index,invariant}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  }
})
