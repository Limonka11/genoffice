// Review mode tells the host what the reviewer does in marked blocks: vound:blockEdited when an edit of
// theirs changes a marked block's text, and vound:caretBlock when the caret enters a marked block or leaves
// one. Tab is the reviewer's "next field": it neither indents nor inserts a tab, and when the caret is in a
// marked block it reports leaving it with Tab. The host's own writes (fieldWrite.ts, HOST_WRITE_META) and
// the app's bookkeeping transactions are not the reviewer's edits.
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import type { Decoration } from '@tiptap/pm/view'
import type { EditorToHost } from './embed-protocol'
import { HOST_WRITE_META } from './fieldWrite'
import { markersKey, replacedWholeDocument } from './markersPlugin'

export const fieldReportingKey = new PluginKey('voundFieldReporting')

type Range = { from: number; to: number }

/** A change the reviewer made. Not: a host write, a document opening (whole-document replace), or a change
 *  kept out of the undo history, which the app uses for its own refreshes (TOC page numbers, pagination
 *  and formatting stamps) and never for typing. */
const isUserEdit = (tr: Transaction) =>
  tr.docChanged && !tr.getMeta(HOST_WRITE_META) && tr.getMeta('addToHistory') !== false && !replacedWholeDocument(tr)

/** the ranges the reviewer's steps changed, in the coordinates of the document after all `trs` */
function editedRanges(trs: readonly Transaction[]) {
  const maps = trs.flatMap((tr) => tr.mapping.maps)
  const ranges: Range[] = []
  let index = 0
  for (const tr of trs) {
    const counted = isUserEdit(tr)
    for (const map of tr.mapping.maps) {
      index += 1
      if (!counted) continue
      const later = new Mapping(maps.slice(index))
      map.forEach((_oldStart, _oldEnd, from, to) => ranges.push({ from: later.map(from, -1), to: later.map(to, 1) }))
    }
  }
  return ranges
}

/** an insertion touches a block only strictly inside it; a paragraph added between two blocks does not */
const touches = (decoration: Decoration, range: Range) =>
  range.from === range.to
    ? decoration.from < range.from && range.from < decoration.to
    : range.from < decoration.to && range.to > decoration.from

const markerDecorationsOf = (state: EditorState) => markersKey.getState(state)?.set.find() ?? []
const unique = (ids: string[]) => [...new Set(ids)]
const slotIdsOf = (decorations: Decoration[]): string[] => unique(decorations.flatMap((decoration) => decoration.spec.slotIds))

/** the slot ids of the marked blocks the caret is in (a marked paragraph inside a marked cell: both) */
const caretIds = (state: EditorState) =>
  slotIdsOf(markerDecorationsOf(state).filter((d) => d.from <= state.selection.from && state.selection.from < d.to))

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

/** a transaction after which the caret may sit in another marked block: the reviewer moved it or typed,
 *  the host placed it, or the markers changed under it. Host writes and app refreshes only map it. */
const mayMoveCaret = (tr: Transaction) =>
  tr.getMeta(markersKey) !== undefined || (tr.selectionSet && !tr.getMeta(HOST_WRITE_META)) || isUserEdit(tr)

/** the plugin reporting edits and caret moves to the host through `post`; one per review-mode session */
export function fieldReportingPlugin(post: (msg: EditorToHost) => void) {
  // the ids of the block the host last heard the caret is in; [] after it heard the caret left
  let reported: string[] = []

  const reportEdits = (trs: readonly Transaction[], state: EditorState) => {
    const ranges = editedRanges(trs)
    if (ranges.length === 0) return
    const edited = markerDecorationsOf(state).filter((decoration) => ranges.some((range) => touches(decoration, range)))
    const ids = slotIdsOf(edited)
    if (ids.length > 0) post({ type: 'vound:blockEdited', ids })
  }

  const reportCaret = (state: EditorState) => {
    const ids = caretIds(state)
    if (sameIds(ids, reported)) return
    reported = ids
    post(ids.length > 0 ? { type: 'vound:caretBlock', ids } : { type: 'vound:caretBlock', ids: [], leftWith: 'other' })
  }

  return new Plugin({
    key: fieldReportingKey,
    // used as the hook that sees every transaction with the state after it; it appends nothing
    appendTransaction: (trs, _oldState, state) => {
      reportEdits(trs, state)
      if (trs.some(mayMoveCaret)) reportCaret(state)
      return null
    },
    props: {
      handleKeyDown: (view, event) => {
        if (event.key !== 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return false
        if (caretIds(view.state).length > 0) {
          reported = []
          post({ type: 'vound:caretBlock', ids: [], leftWith: 'Tab' })
        }
        // no indent, no tab character, no move to the next table cell (which adds a row at the last one)
        return true
      },
    },
  })
}
