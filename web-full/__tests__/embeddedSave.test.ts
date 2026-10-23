import { describe, expect, it } from 'vitest'
import type { EditorToHost } from '../embed-protocol'
import { embeddedSave } from '../embeddedSave'

function recorder() {
  const posted: Array<{ msg: EditorToHost; transfer: Transferable[] }> = []
  return { posted, post: (msg: EditorToHost, transfer: Transferable[]) => posted.push({ msg, transfer }) }
}

describe('embeddedSave', () => {
  it('hands an explicit save to the host as vound:saved', () => {
    const { posted, post } = recorder()
    const data = new Uint8Array([1, 2, 3]).buffer
    expect(embeddedSave('/local/form.docx', data, false, post)).toEqual({ ok: true, path: '/local/form.docx' })
    expect(posted).toHaveLength(1)
    const [{ msg, transfer }] = posted
    expect(msg.type).toBe('vound:saved')
    if (msg.type !== 'vound:saved') return
    expect(msg.name).toBe('form')
    expect([...new Uint8Array(msg.bytes)]).toEqual([1, 2, 3])
    // a copy is transferred, so the app keeps its own buffer
    expect(transfer).toEqual([msg.bytes])
    expect(msg.bytes).not.toBe(data)
    expect(data.byteLength).toBe(3)
  })

  it('treats a save without the auto flag as explicit', () => {
    const { posted, post } = recorder()
    embeddedSave('/local/form.docx', new ArrayBuffer(1), undefined, post)
    expect(posted.map((p) => p.msg.type)).toEqual(['vound:saved'])
  })

  it('never lets an auto save reach the host, and keeps the document unsaved', () => {
    const { posted, post } = recorder()
    expect(embeddedSave('/local/form.docx', new ArrayBuffer(1), true, post)).toEqual({ ok: false, reason: 'external-modified' })
    expect(posted).toEqual([])
  })
})
