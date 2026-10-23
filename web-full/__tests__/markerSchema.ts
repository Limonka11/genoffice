// A minimal stand-in for the Docs schema: the node names the markers code looks for, and docxPara.
import { Schema, type Node as PmNode } from '@tiptap/pm/model'

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    docParagraph: {
      group: 'block',
      content: 'text*',
      attrs: { docxPara: { default: null }, align: { default: null } },
      // only scrollToMarker.test.ts renders a view
      toDOM: () => ['p', 0],
    },
    docProtected: { group: 'block', atom: true, attrs: { docxPara: { default: null } } },
    docTable: { group: 'block', content: 'docTableRow+' },
    docTableRow: { content: 'docTableCell+' },
    docTableCell: { content: 'docParagraph+' },
    text: {},
  },
})

export const para = (docxPara: number | null, text = '') =>
  schema.nodes.docParagraph.create({ docxPara }, text ? schema.text(text) : null)
export const protectedBlock = (docxPara: number) => schema.nodes.docProtected.create({ docxPara })
export const cell = (...paragraphs: PmNode[]) => schema.nodes.docTableCell.create(null, paragraphs)
export const table = (...cells: PmNode[]) => schema.nodes.docTable.create(null, schema.nodes.docTableRow.create(null, cells))
export const doc = (...blocks: PmNode[]) => schema.nodes.doc.create(null, blocks)
/** paragraphs with source indices from..to-1, each with some text */
export const paragraphs = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => para(from + i, `paragraph ${from + i}`))
