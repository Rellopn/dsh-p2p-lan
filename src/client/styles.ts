/**
 * Shared UI tokens for the p2p gate panel. Static geometry/color lives in the
 * inline-style objects below (dsw theme tokens, like the rest of the app);
 * interaction states and motion (hover / focus / active / disabled / slide-in)
 * need real CSS, so a small scoped stylesheet is injected once by the client
 * plugin and keyed by the `.p2p-*` classes applied alongside the inline styles.
 * @module @rellonp/dsh-p2p-lan
 */

import { createElement, type CSSProperties, type ReactNode } from 'react'

/** Scoped stylesheet: interaction states + motion keyframes. */
export const P2P_UI_CSS = `
.p2p-field { transition: border-color .15s ease, box-shadow .15s ease; }
.p2p-field:hover { border-color: var(--dsw-alias-label-tertiary); }
.p2p-field:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.p2p-btn { transition: background .15s ease, transform .05s ease; }
.p2p-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-1); transform: translateY(-1px); }
.p2p-btn:active:not(:disabled) { transform: translateY(0); }
.p2p-btn:disabled { opacity: .5; cursor: not-allowed; }
.p2p-btn-primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--dsw-alias-brand-primary); }
.p2p-btn-link { background: transparent; border: none; color: var(--dsw-alias-label-tertiary); text-decoration: underline; padding: 4px; border-radius: 6px; }
.p2p-btn-link:hover { color: var(--dsw-alias-label-primary); }
.p2p-clickable { transition: border-color .18s ease, transform .18s ease, box-shadow .18s ease; cursor: pointer; }
.p2p-clickable:hover { border-color: var(--dsw-alias-brand-primary); }

/* --- motion --- */
@keyframes p2p-popIn { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes p2p-cardIn { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes p2p-slideRight { from { transform: translateX(-10px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes p2p-fadeUp { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes p2p-badgePop { 0% { transform: scale(.6); } 45% { transform: scale(1.3); } 100% { transform: scale(1); } }

.p2p-pop { animation: p2p-popIn .3s cubic-bezier(.22,.9,.3,1); }
.p2p-card { animation: p2p-cardIn .3s ease both; }
.p2p-slide { animation: p2p-slideRight .3s ease; }
.p2p-fadeup { animation: p2p-fadeUp .25s ease both; }
.p2p-badge { animation: p2p-badgePop .4s cubic-bezier(.22,.9,.3,1); }

/* --- drawer (right slide; no full-screen scrim: the workspace stays interactive) --- */
.p2p-drawer { transform: translateX(105%); transition: transform .32s cubic-bezier(.22,.9,.3,1); }
.p2p-drawer.on { transform: translateX(0); }

/* close button rotate */
.p2p-close { transition: transform .2s ease, background .15s ease, color .15s ease; }
.p2p-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); transform: rotate(90deg); }

/* collapsible content fade-up */
.p2p-collapse[open] > .p2p-collapse-body { animation: p2p-fadeUp .25s ease; }

/* settings group chevron + collapse */
.p2p-group-title { cursor: pointer; user-select: none; transition: color .15s ease; }
.p2p-group-title:hover { color: var(--dsw-alias-label-primary); }
.p2p-group-title .p2p-chev { display: inline-block; transition: transform .2s ease; }
.p2p-group-title[data-open="0"] .p2p-chev { transform: rotate(-90deg); }
.p2p-group-title[data-open="0"] ~ * { display: none; }
`

/** Right-side drawer panel (replaces the old floating corner panel). */
export const drawerPanel: CSSProperties = {
  position: 'fixed', right: 0, top: 0, width: 360, height: '100%', zIndex: 1000,
  display: 'flex', flexDirection: 'column',
  background: 'var(--dsw-alias-bg-overlay)', color: 'var(--dsw-alias-label-primary)',
  borderLeft: '1px solid var(--dsw-alias-border-l2)', boxShadow: '-8px 0 30px rgba(0,0,0,.12)',
}

export const panelHead: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px',
  borderBottom: '1px solid var(--dsw-alias-border-l1)', flex: 'none',
}

export const panelBody: CSSProperties = {
  padding: '12px 14px', overflowY: 'auto', overflowX: 'hidden', flex: 1,
}

export const panelTitle: CSSProperties = { fontWeight: 700, fontSize: 15 }

export const badge: CSSProperties = {
  background: 'var(--dsw-alias-state-error-primary)', color: 'var(--dsw-alias-label-primary-inverted)',
  borderRadius: 10, padding: '0 7px', fontSize: 11, fontVariantNumeric: 'tabular-nums', lineHeight: '16px',
}

export const badgeBrand: CSSProperties = {
  background: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-label-primary-inverted)',
  borderRadius: 10, padding: '0 7px', fontSize: 11, fontVariantNumeric: 'tabular-nums', lineHeight: '16px',
  marginLeft: 'auto',
}

export const gateCard: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)', borderLeft: '3px solid var(--dsw-alias-brand-primary)',
  borderRadius: 10, padding: '11px 12px', marginBottom: 10, background: 'var(--dsw-alias-bg-base)',
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
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, padding: '6px 8px',
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
