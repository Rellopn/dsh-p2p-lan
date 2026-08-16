import { describe, expect, it } from 'vitest'
import { AttachmentBlobStore } from '../src/attachment-store.ts'

describe('attachment blob store', () => {
  it('stores content and returns its identity', () => {
    const store = new AttachmentBlobStore()
    const content = Buffer.from('hello attachment')
    const stored = store.put(content)
    expect(stored.size).toBe(content.length)
    expect(stored.ref).toBe(stored.hash)
    expect(store.has(stored.ref)).toBe(true)
    expect(store.get(stored.ref)?.toString('utf8')).toBe('hello attachment')
  })

  it('dedupes identical content by hash', () => {
    const store = new AttachmentBlobStore()
    const a = store.put(Buffer.from('same'))
    const b = store.put(Buffer.from('same'))
    expect(a.hash).toBe(b.hash)
    expect(a.ref).toBe(b.ref)
  })

  it('delete removes content', () => {
    const store = new AttachmentBlobStore()
    const stored = store.put(Buffer.from('x'))
    store.delete(stored.ref)
    expect(store.has(stored.ref)).toBe(false)
    expect(store.get(stored.ref)).toBeUndefined()
  })
})
