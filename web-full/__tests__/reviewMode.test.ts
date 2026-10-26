// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import Bold from '@tiptap/extension-bold'
import Document from '@tiptap/extension-document'
import Italic from '@tiptap/extension-italic'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Underline from '@tiptap/extension-underline'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { EditorView, type EditorProps } from '@tiptap/pm/view'
import { enterReviewMode, leaveReviewMode, reviewModeKey, reviewModePlugin } from '../reviewMode'
import { doc, schema } from './markerSchema'

// jsdom has no ClipboardEvent; ProseMirror's pasteHTML creates one when it is not given an event
beforeAll(() => {
  if (typeof globalThis.ClipboardEvent === 'undefined') {
    Object.defineProperty(globalThis, 'ClipboardEvent', { value: class extends Event { clipboardData = null }, configurable: true })
  }
})

let view: EditorView | null = null
let editor: Editor | null = null
afterEach(() => {
  view?.destroy(); view = null
  editor?.destroy(); editor = null
  document.documentElement.classList.remove('vound-review')
})

const arial = schema.marks.docTextStyle.create({ font: 'Arial' })
/** one paragraph "Ort: " in Arial, caret at its end */
function reviewView(props: Partial<EditorProps> = {}) {
  const start = doc(schema.nodes.docParagraph.create(null, schema.text('Ort: ', [arial])))
  const state = EditorState.create({ schema, doc: start, plugins: [reviewModePlugin] })
  view = new EditorView(document.createElement('div'), {
    ...props,
    state: state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6))),
  })
  return view
}
const runs = (v: EditorView) => {
  const out: { text: string; marks: unknown[] }[] = []
  v.state.doc.descendants((node) => { if (node.isText) out.push({ text: node.text ?? '', marks: node.marks.map((m) => m.attrs) }) })
  return out
}

describe('reviewModePlugin', () => {
  it("pasting HTML inserts its plain text with the insertion point's marks", () => {
    const v = reviewView()
    v.pasteHTML('<p><b>Berlin</b></p><p>Mitte</p>')
    expect(v.state.doc.childCount).toBe(1)
    expect(runs(v)).toEqual([{ text: 'Ort: Berlin\nMitte', marks: [{ bold: null, font: 'Arial' }] }])
  })

  it("a paste event is handled before the app's own paste handlers", () => {
    const appPaste = vi.fn(() => true)
    const v = reviewView({ handlePaste: appPaste })
    const event = new Event('paste', { bubbles: true, cancelable: true })
    const clipboard: Record<string, string> = { 'text/html': '<p><b>Berlin</b></p>', 'text/plain': 'Berlin\r\nMitte' }
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => clipboard[type] ?? '' } })
    v.dom.dispatchEvent(event)
    expect(appPaste).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    expect(runs(v)).toEqual([{ text: 'Ort: Berlin\nMitte', marks: [{ bold: null, font: 'Arial' }] }])
  })
})

// the platform's Mod key as prosemirror-keymap and tiptap resolve it
const mod = /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
const press = (target: Editor, key: string, modifiers: KeyboardEventInit = mod) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers })
  target.view.dom.dispatchEvent(event)
  return event.defaultPrevented
}
const markNames = (target: Editor) => {
  const names = new Set<string>()
  target.state.doc.descendants((node) => { node.marks.forEach((m) => names.add(m.type.name)) })
  return [...names]
}

describe('enterReviewMode', () => {
  const tiptap = () => {
    editor = new Editor({ element: document.createElement('div'), extensions: [Document, Paragraph, Text, Bold, Italic, Underline], content: '<p>Hallo Welt</p>' })
    editor.commands.setTextSelection({ from: 1, to: 6 })
    return editor
  }

  it('Mod-b, Mod-i, Mod-u are swallowed in review mode', () => {
    const ed = tiptap()
    // control: outside review mode the editor's own keymap bolds the selection
    press(ed, 'b')
    expect(markNames(ed)).toEqual(['bold'])
    press(ed, 'b')
    expect(markNames(ed)).toEqual([])

    enterReviewMode(ed)
    for (const key of ['b', 'i', 'u']) expect(press(ed, key)).toBe(true)
    expect(markNames(ed)).toEqual([])
    // alignment shortcuts too, and nothing else
    for (const key of ['e', 'l', 'r', 'j']) expect(press(ed, key)).toBe(true)
    expect(press(ed, 'z')).toBe(false)
    expect(press(ed, 'b', {})).toBe(false)
  })

  it('marks the page, registers the plugin once and ahead of the keymaps, and leaves again', () => {
    const ed = tiptap()
    enterReviewMode(ed)
    enterReviewMode(ed)
    expect(document.documentElement.classList.contains('vound-review')).toBe(true)
    expect(ed.state.plugins.filter((p) => p === reviewModePlugin)).toHaveLength(1)
    expect(ed.state.plugins[0]).toBe(reviewModePlugin)

    leaveReviewMode(ed)
    expect(document.documentElement.classList.contains('vound-review')).toBe(false)
    expect(reviewModeKey.get(ed.state)).toBeUndefined()
    press(ed, 'b')
    expect(markNames(ed)).toEqual(['bold'])
  })
})
