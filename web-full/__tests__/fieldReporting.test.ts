// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import type { EditorToHost, SlotMarker } from '../embed-protocol'
import { fieldReportingPlugin } from '../fieldReporting'
import { applyFieldValue } from '../fieldWrite'
import { markersPlugin, setMarkers } from '../markersPlugin'
import { doc, para, paragraphs, schema } from './markerSchema'

const marker = (id: string, paragraph: number): SlotMarker => ({ id, paragraph, scope: 'paragraph', tone: 'gap', label: id, actions: [] })

let view: EditorView | null = null
afterEach(() => { view?.destroy(); view = null })

/** paragraphs 0..4; "ort" and "datum" share paragraph 1, "name" marks paragraph 3 */
function reportingView() {
  const post = vi.fn<(msg: EditorToHost) => void>()
  const state = EditorState.create({ schema, doc: doc(...paragraphs(0, 5)), plugins: [markersPlugin, fieldReportingPlugin(post)] })
  view = new EditorView(document.createElement('div'), { state })
  setMarkers(view, [marker('ort', 1), marker('datum', 1), marker('name', 3)])
  return { v: view, post }
}
/** the position inside the paragraph with this source index, `offset` characters in */
const inside = (v: EditorView, index: number, offset = 0) => {
  let found = -1
  v.state.doc.forEach((node, pos) => { if (node.attrs.docxPara === index) found = pos + 1 + offset })
  return found
}
const caretTo = (v: EditorView, pos: number) => v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos)))
const pressTab = (v: EditorView) => {
  const event = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true })
  v.dom.dispatchEvent(event)
  return event
}
const sent = (post: ReturnType<typeof vi.fn>, type: EditorToHost['type']) =>
  post.mock.calls.map(([msg]) => msg).filter((msg: EditorToHost) => msg.type === type)

describe('fieldReportingPlugin', () => {
  it('reports blockEdited for a user edit inside a marked paragraph', () => {
    const { v, post } = reportingView()
    v.dispatch(v.state.tr.insertText('Berlin', inside(v, 1, 3)))
    expect(sent(post, 'vound:blockEdited')).toEqual([{ type: 'vound:blockEdited', ids: ['ort', 'datum'] }])

    // one transaction over two marked paragraphs reports each id once
    post.mockClear()
    v.dispatch(v.state.tr.insertText('x', inside(v, 3, 1)).insertText('y', inside(v, 1, 1)).insertText('z', inside(v, 1, 2)))
    expect(sent(post, 'vound:blockEdited')).toEqual([{ type: 'vound:blockEdited', ids: ['ort', 'datum', 'name'] }])
  })

  it('does not report a host write', () => {
    const { v, post } = reportingView()
    expect(applyFieldValue(v, { block: { paragraph: 1, scope: 'paragraph' }, previous: 'paragraph 1', value: 'Berlin' })).toEqual({ ok: true })
    expect(v.state.doc.child(1).textContent).toBe('Berlin')
    expect(sent(post, 'vound:blockEdited')).toEqual([])
  })

  it('does not report an edit outside markers', () => {
    const { v, post } = reportingView()
    v.dispatch(v.state.tr.insertText('x', inside(v, 2, 1)))
    // a paragraph inserted between two blocks touches the marked neighbours only at their edges
    v.dispatch(v.state.tr.insert(inside(v, 4) - 1, para(null, 'new')))
    // so does deleting the unmarked paragraph between the marked paragraphs 1 and 3
    const second = inside(v, 2) - 1
    v.dispatch(v.state.tr.delete(second, second + v.state.doc.nodeAt(second)!.nodeSize))
    // a change that does not keep history (a field refresh, a pagination stamp) is the app's, not the reviewer's
    v.dispatch(v.state.tr.insertText('q', inside(v, 1, 1)).setMeta('addToHistory', false))
    // a whole-document replace opens another document
    v.dispatch(v.state.tr.replaceWith(0, v.state.doc.content.size, paragraphs(0, 5)))
    expect(sent(post, 'vound:blockEdited')).toEqual([])
  })

  it('reports caretBlock on entering and leftWith Tab on leaving by Tab', () => {
    const { v, post } = reportingView()
    caretTo(v, inside(v, 0, 2))
    expect(sent(post, 'vound:caretBlock')).toEqual([])

    caretTo(v, inside(v, 1, 2))
    // moving inside the block is not news
    caretTo(v, inside(v, 1, 4))
    expect(sent(post, 'vound:caretBlock')).toEqual([{ type: 'vound:caretBlock', ids: ['ort', 'datum'] }])

    const before = v.state.doc
    const tab = pressTab(v)
    // Tab neither indents nor inserts a tab in review mode: it is the reviewer's "next field"
    expect(tab.defaultPrevented).toBe(true)
    expect(v.state.doc.eq(before)).toBe(true)
    expect(sent(post, 'vound:caretBlock').at(-1)).toEqual({ type: 'vound:caretBlock', ids: [], leftWith: 'Tab' })

    // a later move into another marked block enters it; leaving it by a click is 'other'
    caretTo(v, inside(v, 3, 1))
    caretTo(v, inside(v, 4, 1))
    expect(sent(post, 'vound:caretBlock').slice(-2)).toEqual([
      { type: 'vound:caretBlock', ids: ['name'] },
      { type: 'vound:caretBlock', ids: [], leftWith: 'other' },
    ])

    // Tab outside a marked block is swallowed and reports nothing
    post.mockClear()
    expect(pressTab(v).defaultPrevented).toBe(true)
    expect(post).not.toHaveBeenCalled()
  })

  it('reports the block the caret is in when the markers arrive', () => {
    const post = vi.fn<(msg: EditorToHost) => void>()
    const state = EditorState.create({ schema, doc: doc(...paragraphs(0, 3)), plugins: [markersPlugin, fieldReportingPlugin(post)] })
    view = new EditorView(document.createElement('div'), { state })
    caretTo(view, inside(view, 2, 1))
    setMarkers(view, [marker('name', 2)])
    expect(sent(post, 'vound:caretBlock')).toEqual([{ type: 'vound:caretBlock', ids: ['name'] }])
  })
})
