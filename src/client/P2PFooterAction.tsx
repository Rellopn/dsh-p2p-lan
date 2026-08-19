import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { GateItem } from '@rellopn/dsh-p2p-lan/types'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { isPanelOpen, subscribePanel, togglePanel } from './panel-store.ts'
import { badge } from './styles.ts'

/** Registration-side data the footer badge needs. */
export interface P2PFooterInjected {
  gateSnapshot: () => Promise<Array<GateItem & { id: string }>>
}

/** Full footer-action props assembled by the sidebar renderer. */
export type P2PFooterProps = PropsRuntime<'sidebar.footer.action'> & SidebarFooterActionOwnerProps & InjectFace<P2PFooterInjected> & PropsLocale<'p2p'>

/** Sidebar collaboration entry: a prominent chunky bar with a pending-gate badge. */
export function P2PFooterAction({ wide, gateSnapshot, t }: P2PFooterProps): ReactNode {
  const open = useSyncExternalStore(subscribePanel, isPanelOpen)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    let current = true
    const poll = (): void => {
      void gateSnapshot().then((gates) => { if (current) setPending(gates.length) }, () => {})
    }
    poll()
    const timer = setInterval(poll, 5000)
    return () => { current = false; clearInterval(timer) }
  }, [gateSnapshot])

  return (
    <button
      type="button"
      onClick={togglePanel}
      aria-pressed={open}
      className="p2p-clickable p2p-slide"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10,
        background: open ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, var(--dsw-alias-bg-base))'
          : 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        padding: wide ? '8px 10px' : '6px', fontSize: 13, cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: wide ? 15 : 16 }}>👥</span>
      {wide ? <span style={{ fontWeight: 600, flex: 1, textAlign: 'left' }}>{t('footer.label')}</span> : null}
      {pending > 0 ? <span key={pending} className="p2p-badge" style={badge}>{pending}</span> : null}
      {wide ? <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>›</span> : null}
    </button>
  )
}
