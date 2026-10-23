// The host's slot markers inside the editor: a ProseMirror plugin that keeps them as node decorations
// across edits, phased loading and re-parses, plus the calls the shim makes for vound:markers,
// vound:scrollTo and vound:focus. Decorations live in the view only, so nothing here reaches a save.
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'
import { DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { SlotMarker } from './embed-protocol'
import { hasSourceIndices, markerDecorations } from './markers'

/** `placedOnce`: a build since the last vound:markers ran against a parsed document (one whose nodes carry
 *  source indices), whether or not any marker matched; until then an edit may still bring the document */
export type MarkersState = { markers: SlotMarker[]; current: string | null; sealed: boolean; placedOnce: boolean; set: DecorationSet }
type MarkersMeta = { markers?: SlotMarker[]; current?: string | null; sealed?: true; reset?: true }

export const markersKey = new PluginKey<MarkersState>('voundMarkers')

const initial: MarkersState = { markers: [], current: null, sealed: false, placedOnce: false, set: DecorationSet.empty }

function rebuild(doc: PmNode, state: MarkersState): MarkersState {
  const { decorations, dropped } = markerDecorations(doc, state.markers, state.current)
  if (dropped.length > 0) console.info('[vound] markers dropped', dropped)
  const set = DecorationSet.create(doc, decorations)
  const placedOnce = state.placedOnce || decorations.length > 0 || (state.markers.length > 0 && hasSourceIndices(doc))
  return { ...state, placedOnce, set }
}

/** a step that replaced the whole document, as Tiptap's setContent does when a document opens */
const replacedWholeDocument = (tr: Transaction) =>
  tr.steps.some((step, index) => step instanceof ReplaceStep && step.from === 0 && step.to === tr.docs[index].content.size)

/** a document change: map the decorations, and walk the document again only when mapping cannot be trusted */
function afterDocChange(tr: Transaction, old: MarkersState): MarkersState {
  const mapped = old.set.map(tr.mapping, tr.doc)
  const oldCount = old.set.find().length
  // phased appends, splits and deletions change the block count; a split leaves one index on two nodes
  const blockCountChanged = tr.before.childCount !== tr.doc.childCount
  // setNodeMarkup (updateAttributes, every attribute command) replaces the node and drops its node
  // decoration, while docxPara rides along in the copied attrs
  const decorationDropped = mapped.find().length < oldCount
  // markers that arrived before their document: the opened document replaced the initial one-block
  // content without changing the block count. Once a build saw a parsed document this stays off, so
  // markers that all missed it do not cost a walk per keystroke
  const neverPlaced = oldCount === 0 && !old.placedOnce
  // a newly opened document with the same block count: markers built against the previous document
  // while the parse ran have nothing to map from
  const newDocument = replacedWholeDocument(tr)
  if (blockCountChanged || decorationDropped || neverPlaced || newDocument) return rebuild(tr.doc, old)
  return { ...old, set: mapped }
}

function apply(tr: Transaction, old: MarkersState): MarkersState {
  const meta: MarkersMeta | undefined = tr.getMeta(markersKey)
  if (meta?.sealed) return { ...initial, sealed: true }
  if (meta?.reset) return initial
  if (old.sealed) return old
  if (meta?.markers) return rebuild(tr.doc, { ...old, markers: meta.markers, placedOnce: false })
  if (meta && meta.current !== undefined) return rebuild(tr.doc, { ...old, current: meta.current })
  if (tr.docChanged) return afterDocChange(tr, old)
  return old
}

export const markersPlugin = new Plugin<MarkersState>({
  key: markersKey,
  state: { init: () => initial, apply },
  props: {
    decorations: (state) => markersKey.getState(state)?.set,
  },
})

const dispatchMeta = (view: EditorView, meta: MarkersMeta) => view.dispatch(view.state.tr.setMeta(markersKey, meta))

/** replace all markers (vound:markers) */
export function setMarkers(view: EditorView, markers: SlotMarker[]) {
  dispatchMeta(view, { markers })
}

/** make one marker current, or none (vound:focus) */
export function setCurrent(view: EditorView, id: string | null) {
  dispatchMeta(view, { current: id })
}

/** after an explicit save: drop every marker and ignore markers and focus until the next document opens */
export function sealMarkers(view: EditorView) {
  dispatchMeta(view, { sealed: true })
}

/** a document opens (vound:open): drop the previous document's markers and the seal, so no old index
 *  is rebuilt onto the new document's paragraphs; markers the host posts after the open apply as usual */
export function resetMarkers(view: EditorView) {
  dispatchMeta(view, { reset: true })
}

/** make the marker current and scroll its node to the middle of the view; false when no decoration carries the id */
export function scrollToMarker(view: EditorView, id: string) {
  const set = markersKey.getState(view.state)?.set
  const [decoration] = set?.find(undefined, undefined, (spec) => spec.slotId === id) ?? []
  if (!decoration) return false
  setCurrent(view, id)
  const dom = view.nodeDOM(decoration.from)
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center' })
  return true
}
