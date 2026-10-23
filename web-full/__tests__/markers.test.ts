import { describe, expect, it } from 'vitest'
import type { Decoration } from '@tiptap/pm/view'
import type { SlotMarker } from '../embed-protocol'
import { markerDecorations } from '../markers'
import { cell, doc, para, protectedBlock, table } from './markerSchema'

// positions: paragraph 0 at 0..3, protected block 1 at 3..4, table at 4, row at 5, cell at 6..14
// holding paragraph 2 at 7..10 and paragraph 3 at 10..13
const sample = doc(para(0, 'a'), protectedBlock(1), table(cell(para(2, 'b'), para(3, 'c'))))
const marker = (id: string, paragraph: number, scope: SlotMarker['scope'] = 'paragraph', tone: SlotMarker['tone'] = 'proposed'): SlotMarker =>
  ({ id, paragraph, scope, tone })
// a node decoration keeps its DOM attrs on its (untyped) type; nothing public reads them without a view
const attrsOf = (decoration: Decoration) => Reflect.get(Reflect.get(decoration, 'type'), 'attrs')
const described = (decoration: Decoration) =>
  ({ from: decoration.from, to: decoration.to, spec: decoration.spec, attrs: attrsOf(decoration) })
const node = (from: number, to: number, slotId: string, className: string) =>
  ({ from, to, spec: { slotId }, attrs: { class: className, 'data-vound-slot': slotId } })

describe('markerDecorations', () => {
  it('decorates the paragraph node with the index, a protected block too, and the cell for cell scope', () => {
    const { decorations, dropped } = markerDecorations(
      sample,
      [marker('p', 0, 'paragraph', 'proposed'), marker('x', 1, 'paragraph', 'conditional'), marker('c', 3, 'cell', 'gap')],
      null,
    )
    expect(dropped).toEqual([])
    expect(decorations.map(described)).toEqual([
      node(0, 3, 'p', 'vound-slot vound-slot-proposed'),
      node(3, 4, 'x', 'vound-slot vound-slot-conditional'),
      node(6, 14, 'c', 'vound-slot vound-slot-gap'),
    ])
  })

  it('drops an index matching no node or two nodes', () => {
    const twice = doc(para(0, 'a'), para(5, 'first half'), para(5, 'second half'))
    const { decorations, dropped } = markerDecorations(twice, [marker('split', 5), marker('missing', 9), marker('kept', 0)], null)
    expect(dropped).toEqual(['split', 'missing'])
    expect(decorations.map((d) => d.spec.slotId)).toEqual(['kept'])
  })

  it('drops a cell marker whose paragraph sits outside a table cell', () => {
    const { decorations, dropped } = markerDecorations(sample, [marker('outside', 0, 'cell')], null)
    expect(dropped).toEqual(['outside'])
    expect(decorations).toEqual([])
  })

  it('marks only the current id with vound-slot-current', () => {
    const { decorations } = markerDecorations(sample, [marker('a', 0, 'paragraph', 'accepted'), marker('b', 2, 'paragraph', 'refused')], 'b')
    expect(decorations.map(described)).toEqual([
      node(0, 3, 'a', 'vound-slot vound-slot-accepted'),
      node(7, 10, 'b', 'vound-slot vound-slot-refused vound-slot-current'),
    ])
  })
})
