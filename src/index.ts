/** LAN P2P AI-to-AI collaboration messaging. @module @rellopn/dsh-p2p-lan */

export * from './messages.ts'
export * from './identity.ts'
export { DEFAULT_PORT, DEFAULT_SEND_WAIT_TIMEOUT_MS, defaultConfig, resolveConfig } from './config.ts'
export type { ManualPeer, Sensitivity } from './config.ts'
export * from './discovery.ts'
export * from './transport.ts'
export * from './store.ts'
export * from './agent.ts'
export * from './attachment-store.ts'
export * from './reply-engine.ts'
export { apply, inject, name, Config, P2PService } from './plugin.ts'
