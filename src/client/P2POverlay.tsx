import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Envelope, GateItem, PeerInfo } from '@rellopn/dsh-p2p-lan/types'
// Type-only: pulls the shell.overlay SlotMap merge (declared by ui-layout).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { isPanelOpen, subscribePanel } from './panel-store.ts'

/** Registration-side verbs the panel calls through the generated Remote API. */
export interface P2POverlayInjected {
  gateSnapshot: () => Promise<Array<GateItem & { id: string }>>
  peers: () => Promise<PeerInfo[]>
  inboxSnapshot: () => Promise<Envelope[]>
  approveGate: (id: string, finalBody?: string) => Promise<boolean>
  rejectGate: (id: string) => Promise<void>
}

/** Full component props assembled by the shell.overlay renderer. */
export type P2POverlayProps = PropsRuntime<'shell.overlay'> & InjectFace<P2POverlayInjected>

/** Shared action-button style (theme tokens). */
const actionButton: React.CSSProperties = {
  flex: 1,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-primary)',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 6,
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: 12,
}

/** Floating collaboration panel: online peers + pending drafts with approve/edit/reject. */
export function P2POverlay({ gateSnapshot, peers, inboxSnapshot, approveGate, rejectGate }: P2POverlayProps): ReactNode {
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
        if (!ok) setNotice('回复为空，已被拒绝发送——请填写内容后再发送。')
        refresh()
      })
    }
    setEditing(null)
  }

  return (
    <>
      {editing !== null ? (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001,
        }}>
          <div style={{
            background: 'var(--dsw-alias-bg-layer-1)',
            color: 'var(--dsw-alias-label-primary)',
            borderRadius: 8, padding: 16, width: 560,
            border: '1px solid var(--dsw-alias-border-l2)',
            boxShadow: '0 4px 16px rgba(0,0,0,.25)',
          }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>编辑回复</h3>
            <textarea
              value={draft}
              onChange={event => setDraft(event.currentTarget.value)}
              rows={8}
              style={{
                width: '100%', marginTop: 8, boxSizing: 'border-box', font: 'inherit',
                background: 'var(--dsw-alias-bg-base)',
                color: 'var(--dsw-alias-label-primary)',
                border: '1px solid var(--dsw-alias-border-l2)',
                borderRadius: 6, padding: 8, resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={{ ...actionButton, flex: 'none' }} onClick={() => setEditing(null)}>取消</button>
              <button type="button" style={{ ...actionButton, flex: 'none', background: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-label-primary-inverted)' }} onClick={submitEdit}>发送</button>
            </div>
          </div>
        </div>
      ) : null}

      {!open ? null : (
        <div style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          width: 360,
          maxHeight: '60vh',
          overflowY: 'auto',
          background: 'var(--dsw-alias-bg-overlay)',
          color: 'var(--dsw-alias-label-primary)',
          border: '1px solid var(--dsw-alias-border-l2)',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,.18)',
          padding: 12,
          zIndex: 1000,
        }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>协作{gates.length > 0 ? ` · 待审核 ${gates.length}` : ''}</h3>
          {peerList.length > 0 ? (
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 }}>
              {peerList.map(peer => (
                <div key={peer.id} style={{ marginTop: 2 }}>
                  ● {peer.name}
                  {peer.projects.length > 0
                    ? <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>（{peer.projects.join('、')}）</span>
                    : null}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginTop: 4 }}>无在线同事</div>
          )}
          {inbox.length > 0 ? (
            <div style={{ borderTop: '1px solid var(--dsw-alias-border-l1)', marginTop: 8, paddingTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>收件箱</div>
              {inbox.map(message => (
                <div key={message.id} style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>{message.from.name}</span>：{message.body}
                </div>
              ))}
            </div>
          ) : null}
          {gates.map(gate => {
            const draftEmpty = gate.draftBody.trim() === ''
            const peerKnown = peerList.some(p => p.name === gate.original.from.name)
            return (
              <div key={gate.id} style={{ borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 8, marginTop: 8 }}>
                <div style={{ fontWeight: 600 }}>来自 {gate.original.from.name}{gate.original.to.project ? ` · 项目 ${gate.original.to.project}` : ''}</div>
                <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginTop: 4 }}>{gate.original.body}</div>
                {!peerKnown ? (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--dsw-alias-state-warning-primary, #e6a23c)' }}>
                    发送者不在节点目录（未发现/未添加手动节点），回复可能无法送达——请先在设置中将其加入「手动节点」。
                  </div>
                ) : null}
                {draftEmpty
                  ? <div style={{ marginTop: 4, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }}>
                    AI 未能起草回复（provider 未配置或调用失败）。请点击「编辑」填写回复后再发送，空回复会被拒绝。
                  </div>
                  : <div style={{ marginTop: 4, fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>AI 起草：</span>{gate.draftBody}
                  </div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button type="button" style={actionButton} disabled={draftEmpty} onClick={() => { void approveGate(gate.id).then((ok) => { if (!ok) setNotice('回复为空，已被拒绝发送——请填写内容后再发送。'); refresh() }) }}>批准</button>
                  <button type="button" style={actionButton} onClick={() => startEdit(gate)}>编辑</button>
                  <button type="button" style={actionButton} onClick={() => { void rejectGate(gate.id).then(refresh) }}>驳回</button>
                </div>
              </div>
            )
          })}
          {notice !== '' ? (
            <div style={{ borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 8, marginTop: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }}>
              {notice}
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}
