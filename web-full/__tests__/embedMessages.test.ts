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
  it('reads the two messages the host may send', () => {
    const bytes = new ArrayBuffer(4)
    expect(readHostMessage({ type: 'vound:open', name: 'a.docx', bytes })).toEqual({ type: 'vound:open', name: 'a.docx', bytes })
    expect(readHostMessage({ type: 'vound:command', command: 'save' })).toEqual({ type: 'vound:command', command: 'save' })
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
