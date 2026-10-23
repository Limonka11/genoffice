// Which document nodes the host's slot markers point at, as ProseMirror node decorations. Pure: no
// view, so the matching rules are tested on a bare document (markersPlugin.ts applies them).
import type { Node as PmNode } from '@tiptap/pm/model'
import { Decoration } from '@tiptap/pm/view'
import type { SlotMarker } from './embed-protocol'

export const MARKER_CLASS = 'vound-slot'
export const CURRENT_CLASS = 'vound-slot-current'

const cellTypes = ['docTableCell', 'docTableHeader']

type Located = { pos: number; node: PmNode }

/** every node carrying one of the wanted source paragraph indices, by index */
function nodesByIndex(doc: PmNode, wanted: Set<number>) {
  const found = new Map<number, Located[]>()
  doc.descendants((node, pos) => {
    const index = node.attrs.docxPara
    if (typeof index === 'number' && wanted.has(index)) found.set(index, [...(found.get(index) ?? []), { pos, node }])
    // a paragraph's children are inline; nothing below it carries docxPara
    return !node.isTextblock
  })
  return found
}

function enclosingCell(doc: PmNode, pos: number): Located | null {
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (cellTypes.includes(node.type.name)) return { pos: $pos.before(depth), node }
  }
  return null
}

/** the node a marker highlights: its paragraph, or the cell around it for cell scope */
function markerTarget(doc: PmNode, marker: SlotMarker, matches: Located[]) {
  // a split copies docxPara to both halves: an index naming two nodes is ambiguous, so it is not marked
  if (matches.length !== 1) return null
  return marker.scope === 'cell' ? enclosingCell(doc, matches[0].pos) : matches[0]
}

/** node decorations for the markers; `dropped` lists ids whose index matches no node or more than one,
 *  or whose cell scope finds no enclosing docTableCell/docTableHeader */
export function markerDecorations(doc: PmNode, markers: SlotMarker[], currentId: string | null) {
  const decorations: Decoration[] = []
  const dropped: string[] = []
  if (markers.length === 0) return { decorations, dropped }
  const found = nodesByIndex(doc, new Set(markers.map((marker) => marker.paragraph)))
  for (const marker of markers) {
    const target = markerTarget(doc, marker, found.get(marker.paragraph) ?? [])
    if (!target) {
      dropped.push(marker.id)
      continue
    }
    const current = marker.id === currentId ? ` ${CURRENT_CLASS}` : ''
    decorations.push(
      Decoration.node(
        target.pos,
        target.pos + target.node.nodeSize,
        { class: `${MARKER_CLASS} ${MARKER_CLASS}-${marker.tone}${current}`, 'data-vound-slot': marker.id },
        { slotId: marker.id },
      ),
    )
  }
  return { decorations, dropped }
}
