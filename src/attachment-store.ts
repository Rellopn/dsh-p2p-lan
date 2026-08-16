/** Content-addressed attachment blob store (hash-indexed). @module @rellopn/dsh-p2p-lan */

import { createHash } from 'node:crypto'

/** A stored attachment's content identity. */
export interface StoredAttachment {
  hash: string
  size: number
  ref: string
}

/** In-memory content-addressed store for attachment payloads. */
export class AttachmentBlobStore {
  private readonly blobs = new Map<string, Buffer>()

  /** Store content, deduped by sha256; returns the content identity. */
  put(content: Buffer): StoredAttachment {
    const hash = createHash('sha256').update(content).digest('hex')
    if (!this.blobs.has(hash)) this.blobs.set(hash, content)
    return { hash, size: content.length, ref: hash }
  }

  /** Retrieve content by ref, or undefined when absent. */
  get(ref: string): Buffer | undefined {
    return this.blobs.get(ref)
  }

  /** Whether a ref is present. */
  has(ref: string): boolean {
    return this.blobs.has(ref)
  }

  /** Byte length of a stored attachment, or undefined when absent. */
  size(ref: string): number | undefined {
    return this.blobs.get(ref)?.length
  }

  /** Drop one attachment. */
  delete(ref: string): void {
    this.blobs.delete(ref)
  }
}
