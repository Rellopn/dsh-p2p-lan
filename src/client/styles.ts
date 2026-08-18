/**
 * Shared UI tokens for the p2p gate panel. Static geometry/color lives in the
 * inline-style objects below (dsw theme tokens, like the rest of the app);
 * interaction states (hover / focus / active / disabled) need real CSS, so a
 * small scoped stylesheet is injected once by the client plugin and keyed by
 * the `.p2p-*` classes applied alongside the inline styles.
 * @module @rellopn/dsh-p2p-lan
 */

import { createElement, type CSSProperties, type ReactNode } from 'react'

/** Scoped stylesheet for interaction states (injected into <head> once). */
export const P2P_UI_CSS = `
.p2p-field { transition: border-color .15s ease, box-shadow .15s ease; }
.p2p-field:hover { border-color: var(--dsw-alias-label-tertiary); }
.p2p-field:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.p2p-btn { transition: background .15s ease, transform .05s ease; }
.p2p-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-1); }
.p2p-btn:active:not(:disabled) { transform: translateY(1px); }
.p2p-btn:disabled { opacity: .5; cursor: not-allowed; }
.p2p-btn-primary:hover:not(:disabled) { filter: brightness(1.06); }
.p2p-btn-link { background: transparent; border: none; color: var(--dsw-alias-label-tertiary); text-decoration: underline; padding: 4px; border-radius: 6px; }
.p2p-btn-link:hover { color: var(--dsw-alias-label-primary); }
.p2p-clickable { transition: border-color .15s ease; }
.p2p-clickable:hover { border-color: var(--dsw-alias-brand-primary); }
.p2p-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
`

export const panelStyle: CSSProperties = {
  position: 'fixed', right: 16, bottom: 16, width: 360, maxHeight: 'min(68vh, 560px)',
  display: 'flex', flexDirection: 'column',
  background: 'var(--dsw-alias-bg-overlay)', color: 'var(--dsw-alias-label-primary)',
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 14,
  boxShadow: '0 10px 30px rgba(0,0,0,.18)', zIndex: 1000, overflow: 'hidden',
}

export const panelHead: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px',
  borderBottom: '1px solid var(--dsw-alias-border-l1)', flex: 'none',
}

export const panelBody: CSSProperties = {
  padding: '10px 12px', overflowY: 'auto', overflowX: 'hidden', flex: 1,
}

export const badge: CSSProperties = {
  background: 'var(--dsw-alias-state-error-primary)', color: '#fff', borderRadius: 10,
  padding: '0 7px', fontSize: 11, fontVariantNumeric: 'tabular-nums', lineHeight: '16px',
}

export const badgeBrand: CSSProperties = {
  background: 'var(--dsw-alias-brand-primary)', color: '#fff', borderRadius: 10,
  padding: '0 7px', fontSize: 11, fontVariantNumeric: 'tabular-nums', lineHeight: '16px',
  marginLeft: 'auto',
}

export const gateCard: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)', borderLeft: '3px solid var(--dsw-alias-brand-primary)',
  borderRadius: 10, padding: '10px 12px', marginBottom: 10, background: 'var(--dsw-alias-bg-base)',
}

export const chipWarn: CSSProperties = {
  display: 'inline-block', borderRadius: 6, padding: '1px 7px', fontSize: 11, marginTop: 6,
  background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 18%, transparent)',
  color: 'var(--dsw-alias-state-warn-primary)',
}

export const chipErr: CSSProperties = {
  display: 'inline-block', borderRadius: 6, padding: '1px 7px', fontSize: 11, marginTop: 6,
  background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 15%, transparent)',
  color: 'var(--dsw-alias-state-error-primary)',
}

export const actionButton: CSSProperties = {
  flex: 1, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)',
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, padding: '5px 8px',
  cursor: 'pointer', fontSize: 12,
}

export const field: CSSProperties = {
  background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)',
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '6px 10px',
  font: 'inherit', outline: 'none',
}

export const label: CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--dsw-alias-label-secondary)', margin: '10px 0 4px',
}

export const hint: CSSProperties = {
  fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginTop: 3,
}

export const rowStyle: CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center',
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 8, marginTop: 8,
}

/** Inject the scoped stylesheet once. Returns a disposer. */
export function installP2PStyle(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById('p2p-uic-css')
  if (existing !== null) return () => {}
  const el = document.createElement('style')
  el.id = 'p2p-uic-css'
  el.textContent = P2P_UI_CSS
  document.head.appendChild(el)
  return () => { el.remove() }
}

/** Small centered empty-state block. */
export function EmptyState({ icon, text }: { icon: string; text: string }): ReactNode {
  return createElement('div', { style: { textAlign: 'center', padding: '22px 12px', color: 'var(--dsw-alias-label-tertiary)' } },
    createElement('div', { style: { fontSize: 26 } }, icon),
    createElement('div', { style: { marginTop: 6, fontSize: 12 } }, text),
  )
}
