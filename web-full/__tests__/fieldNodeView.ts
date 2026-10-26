// A stand-in for the editor's field passthrough node view (extensions.ts, docProtected with wireFieldEditing
// and wireProtectedInteractionMode): the result text sits in .doc-field-text (no element for an empty result
// without its empty line, a placeholder NBSP on the empty line), a double click starts editing
// (doc-content-editing, contenteditable), stopEvent keeps ProseMirror out of events inside the text while
// editing, and the window event 'ai-docs-commit-tables' commits the typed text.
import type { Node as PmNode } from '@tiptap/pm/model'
import type { EditorView, NodeViewConstructor } from '@tiptap/pm/view'

function fieldTextElement(node: PmNode) {
  const display = node.attrs.fieldDisplay
  if (!display?.left && !display?.emptyLine) return null
  const text = document.createElement('div')
  text.className = 'doc-field-text'
  text.setAttribute('contenteditable', 'false')
  text.textContent = display.emptyLine ? '\u00a0' : display.left
  return text
}

export const fieldNodeView: NodeViewConstructor = (node: PmNode, view: EditorView, getPos: () => number | undefined) => {
  const dom = document.createElement('div')
  dom.className = 'doc-protected'
  const text = fieldTextElement(node)
  if (text) dom.append(text)
  dom.addEventListener('dblclick', () => {
    dom.classList.add('doc-content-editing')
    text?.setAttribute('contenteditable', 'true')
  }, true)
  const commit = () => {
    const left = text?.textContent === '\u00a0' ? '' : (text?.textContent ?? '')
    const pos = getPos()
    if (left === node.attrs.fieldDisplay.left || pos === undefined) return
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, fieldDisplay: { ...node.attrs.fieldDisplay, left } }))
  }
  window.addEventListener('ai-docs-commit-tables', commit)
  return {
    dom,
    update: () => false,
    ignoreMutation: () => true,
    stopEvent: (event) =>
      event.target instanceof Element && !!event.target.closest('.doc-field-text') && dom.classList.contains('doc-content-editing'),
    destroy: () => window.removeEventListener('ai-docs-commit-tables', commit),
  }
}
