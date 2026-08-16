import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { GateItem } from '@rellopn/dsh-p2p-lan/types'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { isPanelOpen, subscribePanel, togglePanel } from './panel-store.ts'

/** Registration-side data the footer badge needs. */
export interface P2PFooterInjected {
  gateSnapshot: () => Promise<Array<GateItem & { id: string }>>
}

/** Full footer-action props assembled by the sidebar renderer. */
export type P2PFooterProps = PropsRuntime<'sidebar.footer.action'> & SidebarFooterActionOwnerProps & InjectFace<P2PFooterInjected>

/** Sidebar foot action: collaboration toggle with a pending-gate badge. */
export function P2PFooterAction({ wide, gateSnapshot }: P2PFooterProps): ReactNode {
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
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6,
        background: open ? 'var(--dsw-alias-bg-layer-2)' : 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        padding: '4px 8px', fontSize: 12, cursor: 'pointer',
      }}
    >
      <span>👥</span>
      {wide ? <span>协作</span> : null}
      {pending > 0 ? <span style={{ background: 'var(--dsw-alias-state-error-primary)', color: 'var(--dsw-alias-label-primary-inverted)', borderRadius: 9, padding: '0 6px', fontSize: 11 }}>{pending}</span> : null}
    </button>
  )
}
