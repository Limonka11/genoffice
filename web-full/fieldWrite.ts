// The host's field writes (vound:setFieldValue) and caret placement (vound:placeCaret), one rule: exact or
// refused. A write replaces the single occurrence of the field's previous text in the visible text of one
// marked block (a paragraph, or the table cell around it), or inserts into an empty cell when there was no
// previous text. Anything else is refused and the document stays untouched. A write is an ordinary editor
// transaction, so it saves the way typing does; it carries HOST_WRITE_META so edit reporting
// (fieldReporting.ts) does not count it as the reviewer's edit.
import type { Node as PmNode } from '@tiptap/pm/model'
import { NodeSelection, Selection, TextSelection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { BlockRef, FieldValueRefusal } from './embed-protocol'
import { locateBlock } from './markers'

/** transaction meta on every host write: not a user edit */
export const HOST_WRITE_META = 'voundHostWrite'

export type FieldValueResult = { ok: true } | { ok: false; reason: FieldValueRefusal }
export type FieldValueWrite = { block: BlockRef; previous: string; value: string }

/** One piece of a block's visible text: a paragraph's text, a field passthrough's result text
 *  (fieldDisplay.left, which the editor saves into the field result), or text the editor cannot edit
 *  (a table-of-contents line, a chart caption). */
type TextUnit = { kind: 'text' | 'field' | 'fixed'; pos: number; node: PmNode; text: string }

function unitOf(node: PmNode, pos: number): TextUnit {
  if (node.isTextblock) return { kind: 'text', pos, node, text: node.textContent }
  const display = node.attrs.fieldDisplay
  const text = typeof display?.left === 'string' ? display.left : ''
  // the same fields the editor's own field editing leaves alone (extensions.ts, wireFieldEditing)
  const editable = display?.kind === 'text' && !node.attrs.chartDisplay
  return { kind: editable ? 'field' : 'fixed', pos, node, text }
}

/** the text units of a block in document order: the block itself, or every paragraph of a cell */
function unitsOf(block: PmNode, pos: number): TextUnit[] {
  if (block.isTextblock || block.isAtom) return [unitOf(block, pos)]
  const units: TextUnit[] = []
  block.descendants((node, offset) => {
    const leaf = node.isTextblock || (node.isBlock && node.isAtom)
    if (leaf) units.push(unitOf(node, pos + 1 + offset))
    return !leaf
  })
  return units
}

/** start offsets of every occurrence, overlapping ones included ("aa" occurs twice in "aaa") */
function occurrences(text: string, needle: string) {
  const starts: number[] = []
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) starts.push(at)
  return starts
}

/** the unit holding text offsets from..to of the units joined with line feeds, with the offsets inside it */
function unitAt(units: TextUnit[], from: number, to: number) {
  let start = 0
  for (const unit of units) {
    const end = start + unit.text.length
    if (from >= start && to <= end) return { unit, from: from - start, to: to - start }
    start = end + 1
  }
  return null
}

type TextRun = { offset: number; pos: number; length: number }

/** the text nodes of a paragraph with their text offsets; inline leaves (breaks, images) add no text */
function textRuns(unit: TextUnit) {
  const runs: TextRun[] = []
  let offset = 0
  unit.node.descendants((child, childPos) => {
    if (!child.isText) return true
    runs.push({ offset, pos: unit.pos + 1 + childPos, length: child.text?.length ?? 0 })
    offset += child.text?.length ?? 0
    return false
  })
  return runs
}

/** Document positions of text offsets from..to of a paragraph. The range starts in the run holding the
 *  first character and ends in the run holding the last, so inline leaves at its edges stay. */
function textRange(unit: TextUnit, from: number, to: number) {
  const runs = textRuns(unit)
  const contentStart = unit.pos + 1
  const holdsStart = runs.find((run) => from >= run.offset && from < run.offset + run.length)
  const holdsEnd = runs.find((run) => to > run.offset && to <= run.offset + run.length)
  const last = runs.at(-1)
  const textEnd = last ? last.pos + last.length : contentStart
  const fromPos = holdsStart ? holdsStart.pos + from - holdsStart.offset : textEnd
  const toPos = holdsEnd ? holdsEnd.pos + to - holdsEnd.offset : fromPos
  return { fromPos, toPos }
}

function replaceInUnit(tr: Transaction, unit: TextUnit, from: number, to: number, value: string) {
  if (unit.kind === 'field') {
    const display = { ...unit.node.attrs.fieldDisplay, left: unit.text.slice(0, from) + value + unit.text.slice(to) }
    // the formatted runs describe the old text; the editor's own field commit drops them the same way
    delete display.runs
    return tr.setNodeMarkup(unit.pos, undefined, { ...unit.node.attrs, fieldDisplay: display })
  }
  const { fromPos, toPos } = textRange(unit, from, to)
  // insertText('') would deleteRange, which may take the emptied paragraph along with its text
  return value ? tr.insertText(value, fromPos, toPos) : tr.delete(fromPos, toPos)
}

type Planned = { unit: TextUnit; from: number; to: number } | { refused: FieldValueRefusal }

/** where the rule puts the value, or why it refuses */
function plan(units: TextUnit[], isCell: boolean, previous: string): Planned {
  const joined = units.map((unit) => unit.text).join('\n')
  if (previous === '') {
    // an empty cell takes the value in its first paragraph; nothing else is written without previous text
    if (!isCell || units.some((unit) => unit.text !== '')) return { refused: 'absent' }
    return units[0] ? { unit: units[0], from: 0, to: 0 } : { refused: 'notEditable' }
  }
  const starts = occurrences(joined, previous)
  if (starts.length === 0) return { refused: 'absent' }
  if (starts.length > 1) return { refused: 'ambiguous' }
  return unitAt(units, starts[0], starts[0] + previous.length) ?? { refused: 'notEditable' }
}

/** vound:setFieldValue: write the value into the block, or refuse and leave the document as it is */
export function applyFieldValue(view: EditorView, write: FieldValueWrite): FieldValueResult {
  const block = locateBlock(view.state.doc, write.block)
  if (!block) return { ok: false, reason: 'noBlock' }
  const planned = plan(unitsOf(block.node, block.pos), write.block.scope === 'cell', write.previous)
  if ('refused' in planned) return { ok: false, reason: planned.refused }
  if (planned.unit.kind === 'fixed') return { ok: false, reason: 'notEditable' }
  if (write.previous === write.value) return { ok: true }
  const tr = replaceInUnit(view.state.tr, planned.unit, planned.from, planned.to, write.value)
  view.dispatch(tr.setMeta(HOST_WRITE_META, true))
  return { ok: true }
}

/** a caret at the end of a paragraph's text, or the whole node for a field passthrough */
function caretIn(doc: PmNode, unit: TextUnit): Selection {
  if (unit.kind === 'text') return TextSelection.create(doc, unit.pos + unit.node.nodeSize - 1)
  return NodeSelection.create(doc, unit.pos)
}

/** vound:placeCaret: the caret at the end of the block's text (a cell's last paragraph), focused and
 *  scrolled into view; false when the block is not found */
export function placeCaret(view: EditorView, block: BlockRef): boolean {
  const located = locateBlock(view.state.doc, block)
  const last = located ? unitsOf(located.node, located.pos).at(-1) : undefined
  if (!last) return false
  view.dispatch(view.state.tr.setSelection(caretIn(view.state.doc, last)).scrollIntoView())
  view.focus()
  return true
}
