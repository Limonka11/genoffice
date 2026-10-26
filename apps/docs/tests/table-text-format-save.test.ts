/** A cell edit that changes a paragraph's text and its run formatting together (Vound fork): the save keeps
 * it, whichever way the table is written. A cell made of paragraphs goes through the cell text patch
 * (tableFormattingChanged); a cell holding a nested table is regenerated, since the patch cannot rewrite
 * its own paragraphs; a tracked-inserted table that was accepted is written unwrapped with the edits. In a
 * legacy form field the field is kept and the new run formatting is not: the text patch keeps the field's
 * runs as they were. */
import { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { parseDocx, saveDocx } from '@genoffice/docx-engine'
import { describe, expect, it } from 'vitest'
import { buildDocx } from '../../../packages/docx-engine/tests/helpers/build-docx'
import { blocksToPmDoc, pmDocToSavePlan, type PmNode } from '../src/renderer/editor/convert'
import { editorExtensions } from '../src/renderer/editor/extensions'

;(globalThis as { CSS?: unknown }).CSS ??= { escape: (s: string) => s }

const cell = (inner: string) => `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${inner}</w:tc>`
const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
const table = (...cells: string[]) =>
  `<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/></w:tblPr><w:tblGrid>${cells.map(() => '<w:gridCol w:w="4000"/>').join('')}</w:tblGrid><w:tr>${cells.join('')}</w:tr></w:tbl>`
const FORMTEXT =
  '<w:p><w:r><w:fldChar w:fldCharType="begin"><w:ffData><w:name w:val="Firma"/><w:enabled/><w:textInput/></w:ffData></w:fldChar></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  '<w:r><w:t>Muster GmbH</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'

const documentXmlOf = async (bytes: Uint8Array) => (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')

/** open the body, apply `edit`, save; the saved document.xml */
async function saveAfter(bodyXml: string, edit: (editor: Editor) => void) {
  const parsed = await parseDocx(await buildDocx({ bodyXml }))
  const editor = new Editor({ element: document.createElement('div'), extensions: editorExtensions, content: blocksToPmDoc(parsed.blocks) as never })
  edit(editor)
  const plan = pmDocToSavePlan(editor.getJSON() as PmNode, parsed.blocks)
  editor.destroy()
  return documentXmlOf(await saveDocx(parsed, plan.saveBlocks))
}

/** replace the text of the paragraph that reads `text`, giving the new text `mark` when one is named */
const retype = (text: string, next: string, mark?: 'bold' | 'italic') => (editor: Editor) => {
  let at = -1
  let size = 0
  editor.state.doc.descendants((node, pos) => {
    if (at === -1 && node.isTextblock && node.textContent === text) [at, size] = [pos + 1, node.content.size]
    return at === -1
  })
  expect(at).toBeGreaterThan(-1)
  const tr = editor.state.tr.insertText(next, at, at + size)
  editor.view.dispatch(mark ? tr.addMark(at, at + next.length, editor.schema.marks[mark].create()) : tr)
}

/** the run that holds `text` */
const runOf = (xml: string, text: string) => xml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)?.find((run) => run.includes(text)) ?? ''

describe('a cell edit of text and run formatting together', () => {
  it('in a cell made of paragraphs: the patch writes the new text and its formatting', async () => {
    const xml = await saveAfter(table(cell(para('Links')), cell(para('Rechts'))), retype('Links', 'LinksNeu', 'bold'))
    expect(runOf(xml, 'LinksNeu')).toContain('<w:b/>')
  })

  it('in a cell holding a nested table: its own paragraph keeps the edit, the nested table stays', async () => {
    const nested = table(cell(para('Innen')))
    const xml = await saveAfter(table(cell(para('Links')), cell(para('Aussen') + nested + '<w:p/>')), retype('Aussen', 'AussenNeu', 'bold'))
    expect(runOf(xml, 'AussenNeu')).toContain('<w:b/>')
    expect(xml).toContain('Innen')
  })

  it('in an accepted tracked-inserted table: written unwrapped, with the edit', async () => {
    const tracked = `<w:ins w:id="7" w:author="Anna" w:date="2026-10-20T10:00:00Z">${table(cell(para('Links')), cell(para('Rechts')))}</w:ins>`
    for (const mark of [undefined, 'bold'] as const) {
      const xml = await saveAfter(tracked, (editor) => {
        let tablePos = -1
        editor.state.doc.forEach((node, pos) => { if (node.type.name === 'docTable') tablePos = pos })
        expect(editor.state.doc.nodeAt(tablePos)?.attrs.blockRevision).toBeTruthy()
        // accept the insertion
        editor.view.dispatch(editor.state.tr.setNodeAttribute(tablePos, 'blockRevision', null))
        retype('Links', 'LinksNeu', mark)(editor)
      })
      expect(runOf(xml, 'LinksNeu'), String(mark)).not.toBe('')
      if (mark) expect(runOf(xml, 'LinksNeu')).toContain('<w:b/>')
      expect(xml).not.toContain('<w:ins ')
    }
  })

  it('in a legacy form field: the field and the new text stay, the new run formatting does not', async () => {
    const xml = await saveAfter(table(cell(para('Firma:')), cell(FORMTEXT)), retype('Muster GmbH', 'Beispiel AG', 'italic'))
    expect(xml.match(/<w:ffData>/g)).toHaveLength(1)
    expect(xml.match(/fldCharType="(begin|separate|end)"/g)).toHaveLength(3)
    expect(runOf(xml, 'Beispiel AG')).not.toContain('<w:i/>')
  })
})
