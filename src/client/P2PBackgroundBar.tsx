import { useEffect, useState, type ReactNode } from 'react'
// Type-only: pulls the conversation.input.dock SlotMap merge + InputZone props.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Registration-side data the dock bar needs. */
export interface P2PBackgroundBarInjected {
  backgroundWaits: () => Promise<Array<{ sessionId: string; count: number }>>
}

/** Full dock props: session-scoped (sessionId injected) + injected remote. */
export type P2PBackgroundBarProps =
  PropsRuntime<'conversation.input.dock'> & InjectFace<P2PBackgroundBarInjected> & PropsLocale<'p2p'>

/**
 * A slim full-width row above the composer showing how many background
 * send-and-wait tasks this conversation is still waiting on (the reply/result
 * arrives automatically later). Renders nothing when there are none.
 */
export function P2PBackgroundBar({ sessionId, backgroundWaits, t }: P2PBackgroundBarProps): ReactNode {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let alive = true
    const load = (): void => {
      void backgroundWaits().then((list) => {
        if (!alive) return
        setCount(list.find(entry => entry.sessionId === sessionId)?.count ?? 0)
      }, () => {})
    }
    load()
    const timer = setInterval(load, 3000)
    return () => { alive = false; clearInterval(timer) }
  }, [sessionId, backgroundWaits])

  if (count <= 0) return null
  return (
    <div className="p2p-fadeup" style={{
      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
      fontSize: 12, color: 'var(--dsw-alias-label-secondary)',
      padding: '5px 10px', borderTop: '1px solid var(--dsw-alias-border-l1)',
      background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)',
    }}>
      <span role="img" aria-hidden>⏳</span>
      <span style={{ fontWeight: 600 }}>{t('bg.waits', { count })}</span>
      <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{t('bg.hint')}</span>
    </div>
  )
}
