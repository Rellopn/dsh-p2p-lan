/** LAN P2P collaboration gate panel, browser half. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the settings shell's SlotMap merge (settings.section).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the ctx.locale browser registry into scope.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// The generated Remote contribution: self-mounted so a standalone plugin does not
// depend on api-remotes hard-coding its namespace.
import p2pRemote from '@rellopn/dsh-p2p-lan/remote'
import { installP2PStyle } from './styles.ts'
import { en, zh } from './i18n.ts'
import { P2PFooterAction, type P2PFooterInjected } from './P2PFooterAction.tsx'
import { P2POverlay, type P2POverlayInjected } from './P2POverlay.tsx'
import { P2PSettingsSection, type P2PSettingsInjected } from './P2PSettingsSection.tsx'

/** Required services: slots, the Remote mount face, and the locale registry. */
export const inject = ['slots', 'remote', 'locale']

/**
 * Client plugin body: self-mount the P2P Remote namespace, then register the
 * sidebar foot toggle and the floating collaboration panel.
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(p2pRemote)
  // Register the bilingual (zh/en) dictionaries; the slot registrations below
  // declare `locale: 'p2p'`, which injects the typed `t` seat into the panels.
  ctx.effect(() => ctx.locale.register('p2p', { zh, en }), 'p2p-lan: dictionaries')
  // Inject the scoped interaction stylesheet (hover/focus/active) once.
  const disposeStyle = installP2PStyle()
  // The mounted namespace lives in a sibling fiber, so the Cordis context proxy
  // cannot resolve `ctx.remote.p2p` without an inject edge (the namespace does
  // not exist until this very apply runs). Read it from the reflect store.
  const p2p = ctx.get('remote.p2p') as typeof ctx.remote.p2p

  const gateSnapshot: P2POverlayInjected['gateSnapshot'] = async () => {
    const result = await p2p.gateSnapshot()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const peers: P2POverlayInjected['peers'] = async () => {
    const result = await p2p.peers()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const inboxSnapshot: P2POverlayInjected['inboxSnapshot'] = async () => {
    const result = await p2p.inboxSnapshot()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const approveGate: P2POverlayInjected['approveGate'] = async (id, finalBody) => {
    const result = await p2p.approveGate(id, finalBody)
    if (!result.ok) throw new Error(result.error.message)
    return result.value.ok
  }
  const rejectGate: P2POverlayInjected['rejectGate'] = async (id) => {
    const result = await p2p.rejectGate(id)
    if (!result.ok) throw new Error(result.error.message)
  }
  const getProjects: P2PSettingsInjected['getProjects'] = async () => {
    const result = await p2p.getProjects()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const setProjects: P2PSettingsInjected['setProjects'] = async (projects) => {
    const result = await p2p.setProjects(projects)
    if (!result.ok) throw new Error(result.error.message)
  }
  const getConfig: P2PSettingsInjected['getConfig'] = async () => {
    const result = await p2p.getConfig()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const setConfig: P2PSettingsInjected['setConfig'] = async (config) => {
    const result = await p2p.setConfig(config)
    if (!result.ok) throw new Error(result.error.message)
  }
  const getNodeStatus: P2PSettingsInjected['getNodeStatus'] = async () => {
    const result = await p2p.nodeStatus()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const getDebugSnapshot: P2PSettingsInjected['getDebugSnapshot'] = async () => {
    const result = await p2p.debugSnapshot()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const importWorkspaces: P2PSettingsInjected['importWorkspaces'] = async () => {
    const result = await p2p.importWorkspaces()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  const sectionLabel = ctx.locale.bind('p2p')

  ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'p2p',
    locale: 'p2p',
    inject: (): P2PFooterInjected => ({ gateSnapshot }),
  }, P2PFooterAction)

  ctx.slots.register({
    name: 'shell.overlay',
    id: 'p2p',
    locale: 'p2p',
    inject: (): P2POverlayInjected => ({ gateSnapshot, peers, inboxSnapshot, approveGate, rejectGate }),
  }, P2POverlay)

  // Settings section: manage the full P2P config (identity, discovery, ports,
  // reply-engine route/gate bias) plus the project table + per-project broadcast.
  ctx.slots.register({
    name: 'settings.section',
    id: 'p2p',
    order: 100,
    label: () => sectionLabel('settings.sectionLabel'),
    locale: 'p2p',
    inject: (): P2PSettingsInjected => ({ getConfig, setConfig, getProjects, setProjects, importWorkspaces, getNodeStatus, getDebugSnapshot }),
  }, P2PSettingsSection)

  return async () => {
    disposeStyle()
    await disposeRemote()
  }
}
