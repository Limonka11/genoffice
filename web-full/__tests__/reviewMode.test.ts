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
import { fieldReportingKey } from '../fieldReporting'
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
  if (editor) { leaveReviewMode(editor); editor.view.dom.remove(); editor.destroy() }
  editor = null
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

  it('a pasted line break survives as a line feed', () => {
    const v = reviewView()
    v.pasteHTML('<p>Berlin<br>Mitte</p>')
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

  it('an HTML-only clipboard pastes one line per block', () => {
    const v = reviewView()
    const event = new Event('paste', { bubbles: true, cancelable: true })
    const html = '<div>\n  <p><b>Berlin</b></p>\n  <ul><li>Mitte</li><li>Nord<br>Ost</li></ul>\n</div>'
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => (type === 'text/html' ? html : '') } })
    v.dom.dispatchEvent(event)
    expect(runs(v)).toEqual([{ text: 'Ort: Berlin\nMitte\nNord\nOst', marks: [{ bold: null, font: 'Arial' }] }])
  })
})

// the platform's Mod key as prosemirror-keymap and tiptap resolve it
const mod = /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
const press = (target: Editor, key: string, modifiers: KeyboardEventInit = mod) =>
  target.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, bubbles: true, cancelable: true, ...modifiers }))
const markNames = (target: Editor) => {
  const names = new Set<string>()
  target.state.doc.descendants((node) => { node.marks.forEach((m) => names.add(m.type.name)) })
  return [...names]
}

const post = vi.fn()

describe('enterReviewMode', () => {
  // a stand-in for App.tsx's window keydown handler: it edits on ⌘E without looking at defaultPrevented
  let appShortcuts: ((e: KeyboardEvent) => void) | null = null
  afterEach(() => { if (appShortcuts) window.removeEventListener('keydown', appShortcuts); appShortcuts = null })
  const tiptap = () => {
    const ed = new Editor({ element: document.createElement('div'), extensions: [Document, Paragraph, Text, Bold, Italic, Underline], content: '<p>Hallo Welt</p>' })
    editor = ed
    document.body.append(ed.view.dom)
    ed.commands.setTextSelection({ from: 1, to: 6 })
    appShortcuts = vi.fn((e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'e') ed.commands.insertContentAt(1, 'Mitte ') })
    window.addEventListener('keydown', appShortcuts)
    return ed
  }

  it('formatting shortcuts reach neither the editor keymaps nor the app in review mode', () => {
    const ed = tiptap()
    // control: outside review mode the editor's keymap bolds and the app's handler edits
    press(ed, 'b')
    expect(markNames(ed)).toEqual(['bold'])
    press(ed, 'b')
    press(ed, 'e')
    expect(ed.getText()).toBe('Mitte Hallo Welt')
    expect(appShortcuts).toHaveBeenCalledTimes(3)
    const before = ed.state.doc

    enterReviewMode(ed, post)
    for (const key of ['b', 'i', 'u', 'e', 'l', 'r', 'j']) press(ed, key)
    expect(ed.state.doc.eq(before)).toBe(true)
    expect(appShortcuts).toHaveBeenCalledTimes(3)
    // undo, copy and plain typing keys still travel
    press(ed, 'z')
    press(ed, 'c')
    press(ed, 'e', {})
    expect(appShortcuts).toHaveBeenCalledTimes(6)
  })

  it("the app's context menu stays shut in review mode, the browser's own one opens", () => {
    const ed = tiptap()
    const appMenu = vi.fn()
    document.body.addEventListener('contextmenu', appMenu)
    const rightClick = () => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      ed.view.dom.dispatchEvent(event)
      return event
    }
    enterReviewMode(ed, post)
    const event = rightClick()
    expect(appMenu).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    leaveReviewMode(ed)
    rightClick()
    expect(appMenu).toHaveBeenCalledTimes(1)
    document.body.removeEventListener('contextmenu', appMenu)
  })

  it('marks the page, registers the plugin once, and leaves again', () => {
    const ed = tiptap()
    enterReviewMode(ed, post)
    enterReviewMode(ed, post)
    expect(document.documentElement.classList.contains('vound-review')).toBe(true)
    expect(ed.state.plugins.filter((p) => p === reviewModePlugin)).toHaveLength(1)
    expect(ed.state.plugins.filter((p) => p.spec.key === fieldReportingKey)).toHaveLength(1)
    // Tab is the reviewer's "next field" in review mode: no indent, no tab character
    const tab = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true })
    ed.view.dom.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)

    leaveReviewMode(ed)
    expect(document.documentElement.classList.contains('vound-review')).toBe(false)
    expect(reviewModeKey.get(ed.state)).toBeUndefined()
    expect(fieldReportingKey.get(ed.state)).toBeUndefined()
    press(ed, 'b')
    expect(markNames(ed)).toEqual(['bold'])
  })
})
