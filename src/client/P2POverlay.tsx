import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Envelope, GateItem, PeerInfo } from '../types.ts'
// Type-only: pulls the shell.overlay SlotMap merge (declared by ui-layout).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { isPanelOpen, subscribePanel, togglePanel } from './panel-store.ts'
import {
  actionButton, badgeBrand, chipErr, chipWarn, drawerPanel, EmptyState, gateCard, panelBody, panelHead,
  panelTitle,
} from './styles.ts'

/** Registration-side verbs the panel calls through the generated Remote API. */
export interface P2POverlayInjected {
  gateSnapshot: () => Promise<Array<GateItem & { id: string }>>
  peers: () => Promise<PeerInfo[]>
  inboxSnapshot: () => Promise<Envelope[]>
  approveGate: (id: string, finalBody?: string) => Promise<boolean>
  rejectGate: (id: string) => Promise<void>
}

/** Full component props assembled by the shell.overlay renderer. */
export type P2POverlayProps = PropsRuntime<'shell.overlay'> & InjectFace<P2POverlayInjected> & PropsLocale<'p2p'>

const closeBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--dsw-alias-label-tertiary)',
  cursor: 'pointer', fontSize: 14, borderRadius: 6, padding: '2px 8px', lineHeight: 1, marginLeft: 'auto',
}

const inboxRow: React.CSSProperties = {
  fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginTop: 6, display: 'flex', gap: 6,
  overflowWrap: 'anywhere',
}

/** Collaboration drawer: slides in from the right; header + peers + gate cards + collapsible inbox. */
export function P2POverlay({ gateSnapshot, peers, inboxSnapshot, approveGate, rejectGate, t }: P2POverlayProps): ReactNode {
  const open = useSyncExternalStore(subscribePanel, isPanelOpen)
  const [gates, setGates] = useState<Array<GateItem & { id: string }>>([])
  const [peerList, setPeerList] = useState<PeerInfo[]>([])
  const [inbox, setInbox] = useState<Envelope[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = (): void => {
    void gateSnapshot().then(setGates, () => setGates([]))
    void peers().then(setPeerList, () => setPeerList([]))
    void inboxSnapshot().then(setInbox, () => setInbox([]))
  }
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [gateSnapshot, peers, inboxSnapshot])

  const startEdit = (gate: GateItem & { id: string }): void => {
    setEditing(gate.id)
    setDraft(gate.draftBody)
    setNotice('')
  }
  const submitEdit = (): void => {
    if (editing !== null) {
      void approveGate(editing, draft).then((ok) => {
        if (!ok) setNotice(t('overlay.emptyReplyNotice'))
        refresh()
      })
    }
    setEditing(null)
  }

  const modalStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001,
  }
  const modalCard: React.CSSProperties = {
    background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
    borderRadius: 12, padding: 16, width: 560,
    border: '1px solid var(--dsw-alias-border-l2)', boxShadow: '0 4px 16px rgba(0,0,0,.25)',
  }
  const editArea: React.CSSProperties = {
    width: '100%', marginTop: 8, boxSizing: 'border-box', font: 'inherit', minHeight: 120,
    background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)',
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 8, resize: 'vertical', outline: 'none',
  }

  const gateCount = gates.length
  const hasContent = gateCount > 0 || peerList.length > 0 || inbox.length > 0

  return (
    <>
      {editing !== null ? (
        <div className="p2p-pop" style={modalStyle}>
          <div style={modalCard}>
            <h3 style={{ margin: 0, fontSize: 14 }}>{t('overlay.editReplyTitle')}</h3>
            <textarea value={draft} onChange={event => setDraft(event.currentTarget.value)} style={editArea} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="p2p-btn" style={{ ...actionButton, flex: 'none' }} onClick={() => setEditing(null)}>{t('overlay.cancel')}</button>
              <button type="button" className="p2p-btn" style={{ ...actionButton, flex: 'none', background: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-label-primary-inverted)' }} onClick={submitEdit}>{t('overlay.send')}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Right drawer slides in WITHOUT a full-screen scrim, so the workspace
          stays visible and interactive; the user closes it manually (✕). */}
      <div className={'p2p-drawer' + (open ? ' on' : '')} style={drawerPanel}>
        <div style={panelHead}>
          <span style={panelTitle}>{t('overlay.title')}</span>
          {gateCount > 0 ? <span key={gateCount} className="p2p-badge" style={badgeBrand}>{gateCount}</span> : null}
          <button type="button" className="p2p-close" style={closeBtn} aria-label={t('overlay.edit')} onClick={() => togglePanel()}>✕</button>
        </div>

        {!hasContent ? (
          <div style={panelBody}><EmptyState icon="👥" text={t('overlay.noPeers')} /></div>
        ) : (
          <div style={panelBody}>
            {peerList.length > 0 ? (
              <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8 }}>
                {peerList.map(peer => (
                  <span key={peer.id} style={{ marginRight: 12 }}>
                    <span style={{ color: 'var(--dsw-alias-state-success-primary)', fontSize: 10, marginRight: 3 }}>●</span>{peer.name}
                    {peer.projects.length > 0
                      ? <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{t('overlay.peerProjects', { projects: peer.projects.join('、') })}</span>
                      : null}
                  </span>
                ))}
              </div>
            ) : null}

            {gates.map(gate => {
              const draftEmpty = gate.draftBody.trim() === ''
              const peerKnown = peerList.some(p => p.name === gate.original.from.name)
              return (
                <div key={gate.id} className="p2p-card" style={gateCard}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>
                    {gate.original.to.project
                      ? t('overlay.fromProject', { name: gate.original.from.name, project: gate.original.to.project })
                      : t('overlay.from', { name: gate.original.from.name })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 }}>{gate.original.body}</div>
                  {!peerKnown ? <div style={chipWarn}>{t('overlay.unknownSender')}</div> : null}
                  {draftEmpty
                    ? <div style={chipErr}>{t('overlay.aiFailed')}</div>
                    : <div style={{ marginTop: 6, fontSize: 12 }}><span style={{ fontWeight: 600 }}>{t('overlay.aiDraft')}</span>{gate.draftBody}</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button type="button" className="p2p-btn" style={actionButton} disabled={draftEmpty} onClick={() => { setGates(prev => prev.filter(g => g.id !== gate.id)); void approveGate(gate.id).then((ok) => { if (!ok) { setNotice(t('overlay.emptyReplyNotice')); refresh() } }) }}>{t('overlay.approve')}</button>
                    <button type="button" className="p2p-btn" style={actionButton} onClick={() => startEdit(gate)}>{t('overlay.edit')}</button>
                    <button type="button" className="p2p-btn" style={actionButton} onClick={() => { setGates(prev => prev.filter(g => g.id !== gate.id)); void rejectGate(gate.id).then(refresh, refresh) }}>{t('overlay.reject')}</button>
                  </div>
                </div>
              )
            })}

            {inbox.length > 0 ? (
              <details className="p2p-collapse" style={{ borderTop: '1px solid var(--dsw-alias-border-l1)', marginTop: 8, paddingTop: 8 }} open>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
                  {t('overlay.inbox')}（{inbox.length}）
                </summary>
                <div className="p2p-collapse-body">
                  {inbox.map(message => (
                    <div key={message.id} style={inboxRow}>
                      <b style={{ flex: 'none' }}>{message.from.name}：</b>
                      <span>{message.body}</span>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {notice !== '' ? (
              <div style={{ borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 8, marginTop: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }}>
                {notice}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}
