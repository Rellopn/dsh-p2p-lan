/** Module-local open/close state shared by the footer toggle and the floating panel. */

let open = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function isPanelOpen(): boolean {
  return open
}

export function togglePanel(): void {
  open = !open
  emit()
}

export function openPanel(): void {
  if (!open) {
    open = true
    emit()
  }
}

export function subscribePanel(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
