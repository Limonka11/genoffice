// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keymap } from '@tiptap/pm/keymap'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import type { EditorToHost, FieldAction, SlotMarker } from '../embed-protocol'
import { fieldReportingPlugin } from '../fieldReporting'
import { markersPlugin, setCurrent, setMarkers } from '../markersPlugin'
import { isMacPlatform } from '../reviewShortcuts'
import { doc, paragraphs, schema } from './markerSchema'

const marker = (id: string, paragraph: number, actions: FieldAction[]): SlotMarker => ({ id, paragraph, scope: 'paragraph', tone: 'proposed', label: id, actions })
const mod = isMacPlatform() ? { metaKey: true } : { ctrlKey: true }

let view: EditorView | null = null
afterEach(() => { view?.dom.remove(); view?.destroy(); view = null })

/** paragraphs 0..4: "name" (accept, reject) on 1, "ort" and "datum" (accept) share 2, "plz" (fill) on 3;
 *  a later keymap stands in for the editor's own Mod-Enter page break */
function keysView() {
  const post = vi.fn<(msg: EditorToHost) => void>()
  const pageBreak = vi.fn(() => true)
  const state = EditorState.create({
    schema,
    doc: doc(...paragraphs(0, 5)),
    plugins: [markersPlugin, fieldReportingPlugin(post), keymap({ 'Mod-Enter': pageBreak })],
  })
  view = new EditorView(document.createElement('div'), { state })
  setMarkers(view, [marker('name', 1, ['accept', 'reject']), marker('ort', 2, ['accept']), marker('datum', 2, ['accept']), marker('plz', 3, ['fill'])])
  return { v: view, post, pageBreak }
}
const caretIn = (v: EditorView, index: number) => {
  let pos = -1
  v.state.doc.forEach((node, offset) => { if (node.attrs.docxPara === index) pos = offset + 2 })
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos)))
}
const press = (v: EditorView, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...mod, ...init })
  v.dom.dispatchEvent(event)
  return event
}
const accept = { key: 'Enter', code: 'Enter' }
const reject = { key: 'Backspace', code: 'Backspace', shiftKey: true }
const actions = (post: ReturnType<typeof vi.fn>) =>
  post.mock.calls.map(([msg]) => msg).filter((msg: EditorToHost) => msg.type === 'vound:fieldAction')

describe('review-mode accept and reject keys', () => {
  it('accept and reject the field at the caret, instead of the key', () => {
    const { v, post, pageBreak } = keysView()
    caretIn(v, 1)
    expect(press(v, accept).defaultPrevented).toBe(true)
    expect(press(v, reject).defaultPrevented).toBe(true)
    expect(actions(post)).toEqual([
      { type: 'vound:fieldAction', id: 'name', action: 'accept' },
      { type: 'vound:fieldAction', id: 'name', action: 'reject' },
    ])
    expect(pageBreak).not.toHaveBeenCalled()
  })

  it('leave the key alone outside a marked block or when the field lacks the action', () => {
    const { v, post, pageBreak } = keysView()
    caretIn(v, 0)
    press(v, accept)
    expect(press(v, reject).defaultPrevented).toBe(false)
    caretIn(v, 3)
    press(v, accept)
    expect(press(v, reject).defaultPrevented).toBe(false)
    expect(actions(post)).toEqual([])
    // the editor's own Mod-Enter still runs
    expect(pageBreak).toHaveBeenCalledTimes(2)
  })

  it('need the modifier: plain Enter and Shift+Backspace keep their meaning', () => {
    const { v, post } = keysView()
    caretIn(v, 1)
    press(v, { ...accept, ctrlKey: false, metaKey: false })
    press(v, { ...reject, ctrlKey: false, metaKey: false })
    expect(actions(post)).toEqual([])
  })

  it('in a block of several fields offering the action, act on the current one only', () => {
    const { v, post, pageBreak } = keysView()
    caretIn(v, 2)
    press(v, accept)
    expect(actions(post)).toEqual([])
    expect(pageBreak).toHaveBeenCalledTimes(1)
    setCurrent(v, 'datum')
    press(v, accept)
    expect(pageBreak).toHaveBeenCalledTimes(1)
    expect(actions(post)).toEqual([{ type: 'vound:fieldAction', id: 'datum', action: 'accept' }])
  })

  it('keep Tab as the next-field key', () => {
    const { v, post } = keysView()
    caretIn(v, 1)
    expect(press(v, { key: 'Tab', code: 'Tab', ctrlKey: false, metaKey: false }).defaultPrevented).toBe(true)
    expect(post.mock.calls.map(([msg]) => msg).at(-1)).toEqual({ type: 'vound:caretBlock', ids: [], leftWith: 'Tab' })
  })
})
