/** Legacy text form fields (FORMTEXT) in table cells through the editor's save path (Vound fork). A text
 * edit inside one keeps the field machinery around the changed w:t, including emptying the field, which
 * removes its runs and their marks, and typing again into the emptied field without those marks. An
 * untouched save is byte-identical. */
import { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { parseDocx, saveDocx } from '@genoffice/docx-engine'
import { describe, expect, it } from 'vitest'
import { buildDocx } from '../../../packages/docx-engine/tests/helpers/build-docx'
import { blocksToPmDoc, pmDocToSavePlan, type PmNode } from '../src/renderer/editor/convert'
import { editorExtensions } from '../src/renderer/editor/extensions'

;(globalThis as { CSS?: unknown }).CSS ??= { escape: (s: string) => s }

const RPR = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/></w:rPr>'
/** a FORMTEXT paragraph whose result is `result`, one w:t per entry */
const formText = (name: string, ...result: string[]) =>
  `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r>${RPR}<w:fldChar w:fldCharType="begin"><w:ffData><w:name w:val="${name}"/><w:enabled/><w:textInput/></w:ffData></w:fldChar></w:r>` +
  `<w:r>${RPR}<w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r><w:r>${RPR}<w:fldChar w:fldCharType="separate"/></w:r>` +
  result.map((text) => `<w:r>${RPR}<w:t xml:space="preserve">${text}</w:t></w:r>`).join('') +
  `<w:r>${RPR}<w:fldChar w:fldCharType="end"/></w:r></w:p>`
const cell = (...paragraphs: string[]) => `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${paragraphs.join('')}</w:tc>`
const label = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
const EN_SPACES = '\u2002'.repeat(5)
const BODY =
  '<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>' +
  `<w:tr>${cell(label('Firma:'))}${cell(formText('Firma', 'Muster Ingenieure GmbH'))}</w:tr>` +
  `<w:tr>${cell(label('Telefon:'))}${cell(formText('Telefon', '089 123 456'))}</w:tr>` +
  `<w:tr>${cell(label('Fax:'))}${cell(formText('Fax', ...EN_SPACES))}</w:tr>` +
  '</w:tbl><w:p/>'
const FIELD_MACHINERY = [/<w:ffData>/g, / FORMTEXT /g, /fldCharType="begin"/g, /fldCharType="separate"/g, /fldCharType="end"/g, /<w:instrText/g]

const documentXmlOf = async (bytes: Uint8Array) => (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')

async function open() {
  const bytes = await buildDocx({ bodyXml: BODY })
  const parsed = await parseDocx(bytes)
  const editor = new Editor({ element: document.createElement('div'), extensions: editorExtensions, content: blocksToPmDoc(parsed.blocks) as never })
  return { bytes, parsed, editor }
}

/** the position and node of the cell paragraph whose text is `text` */
function cellParagraph(editor: Editor, text: string) {
  let found: { pos: number; size: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isTextblock) return !found
    if (node.textContent === text) found = { pos, size: node.content.size }
    return false
  })
  if (!found) throw new Error(`no paragraph "${text}"`)
  return found
}

/** each field's name and the text between its separate and end */
function fieldResults(xml: string) {
  const separate = 'w:fldCharType="separate"/>'
  return xml.split('<w:ffData>').slice(1).map((part) => {
    const name = /<w:name w:val="([^"]+)"/.exec(part)?.[1]
    const from = part.indexOf(separate) + separate.length
    return [name, part.slice(from, part.indexOf('w:fldCharType="end"', from)).replace(/<[^>]*>|<[^>]*$/g, '')]
  })
}

async function saveAfter(edit: (editor: Editor) => void) {
  const { bytes, parsed, editor } = await open()
  edit(editor)
  const plan = pmDocToSavePlan(editor.getJSON() as PmNode, parsed.blocks)
  editor.destroy()
  const savedXml = await documentXmlOf(await saveDocx(parsed, plan.saveBlocks))
  return { plan, savedXml, sourceXml: await documentXmlOf(bytes) }
}

const keepsFields = (savedXml: string, sourceXml: string) => {
  for (const pattern of FIELD_MACHINERY) expect(savedXml.match(pattern)?.length, String(pattern)).toBe(sourceXml.match(pattern)?.length)
}

describe('a FORMTEXT field in a table cell through the editor', () => {
  it('saves untouched byte for byte', async () => {
    const { plan, savedXml, sourceXml } = await saveAfter(() => {})
    expect(plan.changedCount).toBe(0)
    expect(savedXml).toBe(sourceXml)
  })

  it('keeps every field when one is emptied', async () => {
    const { savedXml, sourceXml } = await saveAfter((editor) => {
      const { pos, size } = cellParagraph(editor, 'Muster Ingenieure GmbH')
      editor.view.dispatch(editor.state.tr.delete(pos + 1, pos + 1 + size))
    })
    keepsFields(savedXml, sourceXml)
    expect(fieldResults(savedXml)).toEqual([['Firma', ''], ['Telefon', '089 123 456'], ['Fax', EN_SPACES]])
  })

  it('keeps every field when one is shortened or replaced', async () => {
    const shortened = await saveAfter((editor) => {
      const { pos } = cellParagraph(editor, 'Muster Ingenieure GmbH')
      editor.view.dispatch(editor.state.tr.delete(pos + 1 + 'Muster'.length, pos + 1 + 'Muster Ingenieure'.length))
    })
    keepsFields(shortened.savedXml, shortened.sourceXml)
    expect(fieldResults(shortened.savedXml)[0]).toEqual(['Firma', 'Muster GmbH'])

    const replaced = await saveAfter((editor) => {
      const { pos, size } = cellParagraph(editor, '089 123 456')
      editor.view.dispatch(editor.state.tr.insertText('0171 999', pos + 1, pos + 1 + size))
    })
    keepsFields(replaced.savedXml, replaced.sourceXml)
    expect(fieldResults(replaced.savedXml)[1]).toEqual(['Telefon', '0171 999'])
  })

  it('keeps every field when an emptied field is typed into again without its marks', async () => {
    const { savedXml, sourceXml } = await saveAfter((editor) => {
      const { pos, size } = cellParagraph(editor, 'Muster Ingenieure GmbH')
      editor.view.dispatch(editor.state.tr.delete(pos + 1, pos + 1 + size))
      editor.view.dispatch(editor.state.tr.setStoredMarks([]).insertText('Beispiel AG', pos + 1))
    })
    keepsFields(savedXml, sourceXml)
    expect(fieldResults(savedXml)[0]).toEqual(['Firma', 'Beispiel AG'])
  })

  it('takes Word\'s empty result (five en spaces) and gives it back', async () => {
    const rejected = await saveAfter((editor) => {
      const { pos, size } = cellParagraph(editor, '089 123 456')
      editor.view.dispatch(editor.state.tr.insertText(EN_SPACES, pos + 1, pos + 1 + size))
    })
    keepsFields(rejected.savedXml, rejected.sourceXml)
    expect(fieldResults(rejected.savedXml)[1]).toEqual(['Telefon', EN_SPACES])
  })
})
