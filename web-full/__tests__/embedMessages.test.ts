import { describe, expect, it } from 'vitest'
import { acceptsHostMessage, readHostMessage } from '../embedMessages'

describe('acceptsHostMessage', () => {
  it('accepts only the parent on the same origin', () => {
    const parent = {} as Window
    const self = { origin: 'https://app.test', parent }
    expect(acceptsHostMessage({ origin: 'https://app.test', source: parent }, self)).toBe(true)
    expect(acceptsHostMessage({ origin: 'https://evil.test', source: parent }, self)).toBe(false)
    expect(acceptsHostMessage({ origin: 'https://app.test', source: {} as Window }, self)).toBe(false)
    expect(acceptsHostMessage({ origin: 'https://app.test', source: null }, self)).toBe(false)
  })
})

describe('readHostMessage', () => {
  it('reads open and command', () => {
    const bytes = new ArrayBuffer(4)
    expect(readHostMessage({ type: 'vound:open', name: 'a.docx', bytes })).toEqual({ type: 'vound:open', name: 'a.docx', bytes })
    expect(readHostMessage({ type: 'vound:command', command: 'save' })).toEqual({ type: 'vound:command', command: 'save' })
  })

  it('reads markers, scrollTo and focus, and rejects a malformed marker', () => {
    const marker = { id: 'slot:s1', paragraph: 3, scope: 'cell', tone: 'conditional' }
    expect(readHostMessage({ type: 'vound:markers', markers: [marker] })).toEqual({ type: 'vound:markers', markers: [marker] })
    expect(readHostMessage({ type: 'vound:markers', markers: [] })).toEqual({ type: 'vound:markers', markers: [] })
    const withOne = (patch: object) => readHostMessage({ type: 'vound:markers', markers: [marker, { ...marker, ...patch }] })
    expect(withOne({ paragraph: 1.5 })).toBeNull()
    expect(withOne({ paragraph: -1 })).toBeNull()
    expect(withOne({ paragraph: '3' })).toBeNull()
    expect(withOne({ tone: 'pink' })).toBeNull()
    expect(withOne({ scope: 'row' })).toBeNull()
    expect(withOne({ id: 7 })).toBeNull()
    expect(readHostMessage({ type: 'vound:markers', markers: [{ paragraph: 3, scope: 'cell', tone: 'gap' }] })).toBeNull()
    expect(readHostMessage({ type: 'vound:markers', markers: 'none' })).toBeNull()
    expect(readHostMessage({ type: 'vound:markers', markers: [null] })).toBeNull()

    expect(readHostMessage({ type: 'vound:scrollTo', id: 'slot:s2' })).toEqual({ type: 'vound:scrollTo', id: 'slot:s2' })
    expect(readHostMessage({ type: 'vound:scrollTo', id: null })).toBeNull()
    expect(readHostMessage({ type: 'vound:focus', id: 'slot:s2' })).toEqual({ type: 'vound:focus', id: 'slot:s2' })
    expect(readHostMessage({ type: 'vound:focus', id: null })).toEqual({ type: 'vound:focus', id: null })
    expect(readHostMessage({ type: 'vound:focus' })).toBeNull()
  })

  it('keeps only the known marker fields', () => {
    const msg = readHostMessage({ type: 'vound:markers', markers: [{ id: 'a', paragraph: 0, scope: 'paragraph', tone: 'gap', extra: 1 }] })
    expect(msg).toEqual({ type: 'vound:markers', markers: [{ id: 'a', paragraph: 0, scope: 'paragraph', tone: 'gap' }] })
  })

  it('ignores anything else', () => {
    expect(readHostMessage(null)).toBeNull()
    expect(readHostMessage('vound:open')).toBeNull()
    expect(readHostMessage({ type: 'vound:open', name: 'a.docx', bytes: 'not bytes' })).toBeNull()
    expect(readHostMessage({ type: 'vound:open', bytes: new ArrayBuffer(1) })).toBeNull()
    expect(readHostMessage({ type: 'vound:command', command: 'undo' })).toBeNull()
    expect(readHostMessage({ type: 'vound:command', command: 'save-as' })).toBeNull()
    expect(readHostMessage({ type: 'other' })).toBeNull()
  })
})
