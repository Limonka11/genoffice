// Review mode (vound:open with mode 'review'): the host shows its own bar instead of the ribbon, so the
// editor works like a text field. Paste inserts plain text in the insertion point's formatting, and the
// formatting shortcuts do nothing. host.css hides the ribbon, its tab row and the status bar under
// html.vound-review.
import type { Editor } from '@tiptap/core'
import { keydownHandler } from '@tiptap/pm/keymap'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export const reviewModeKey = new PluginKey('voundReviewMode')

/** Plain text at the selection; insertText keeps the stored marks or those at the insertion point. */
function insertPlainText(view: EditorView, text: string) {
  if (text) view.dispatch(view.state.tr.insertText(text).scrollIntoView())
  return true
}

/** The clipboard's text, from text/plain or else the text of its HTML. */
function clipboardText(data: DataTransfer) {
  const plain = data.getData('text/plain')
  const text = plain || (new DOMParser().parseFromString(data.getData('text/html'), 'text/html').body.textContent ?? '')
  return text.replace(/\r\n?/g, '\n')
}

const swallow = () => true
// bold, italic, underline and the four paragraph alignments
const formattingShortcuts = keydownHandler(
  Object.fromEntries(['Mod-b', 'Mod-i', 'Mod-u', 'Mod-e', 'Mod-l', 'Mod-r', 'Mod-j'].map((key) => [key, swallow])),
)

export const reviewModePlugin = new Plugin({
  key: reviewModeKey,
  props: {
    // The app's own paste handlers are direct editor props, which ProseMirror asks before any plugin,
    // and some of them insert formatted content themselves. The DOM event reaches this plugin first.
    handleDOMEvents: {
      paste: (view, event) => {
        if (!view.editable || !event.clipboardData) return false
        event.preventDefault()
        return insertPlainText(view, clipboardText(event.clipboardData))
      },
    },
    // pastes that skip the DOM event (view.pasteHTML, the app's paste-options chip) arrive here as a slice
    handlePaste: (view, _event, slice) => insertPlainText(view, slice.content.textBetween(0, slice.content.size, '\n')),
    handleKeyDown: formattingShortcuts,
  },
})

/** Marks the page for host.css and registers the plugin once, ahead of the editor's own keymaps. */
export function enterReviewMode(editor: Editor): void {
  document.documentElement.classList.add('vound-review')
  if (!reviewModeKey.get(editor.state)) editor.registerPlugin(reviewModePlugin, (plugin, plugins) => [plugin, ...plugins])
}

/** Back to the plain embedded editor, for a vound:open without review mode. */
export function leaveReviewMode(editor: Editor): void {
  document.documentElement.classList.remove('vound-review')
  if (reviewModeKey.get(editor.state)) editor.unregisterPlugin(reviewModeKey)
}
