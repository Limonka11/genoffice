/** Every paragraph-level node carries its source paragraph index (docxPara,
 * rendered as data-src-p): top-level paragraphs, cell paragraphs and protected
 * blocks. A paragraph the user inserts has none. */
import { Editor, type JSONContent } from '@tiptap/core'
import { parseDocx } from '@genoffice/docx-engine'
import { describe, expect, it } from 'vitest'
import { buildDocx } from '../../../packages/docx-engine/tests/helpers/build-docx'
import { blocksToPmDoc } from '../src/renderer/editor/convert'
import { editorExtensions } from '../src/renderer/editor/extensions'

;(globalThis as { CSS?: unknown }).CSS ??= { escape: (s: string) => s }

const P = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
const TC = (inner: string, tcPr = '') => `<w:tc>${tcPr}${inner}</w:tc>`
const FORM_FIELD_P =
  '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>entry</w:t></w:r>' +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
const LIST_P =
  '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' +
  '<w:r><w:t>cell item</w:t></w:r></w:p>'
const BODY =
  '<w:p/>' +
  '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>' +
  '<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>' +
  `<w:tr>${TC(P('r0c0'))}${TC(P('r0c1'), '<w:tcPr><w:vMerge w:val="restart"/></w:tcPr>')}</w:tr>` +
  `<w:tr>${TC(P('r1c0a') + LIST_P)}${TC('<w:p/>', '<w:tcPr><w:vMerge/></w:tcPr>')}</w:tr>` +
  '</w:tbl>' +
  FORM_FIELD_P +
  P('last')

const PARAGRAPH_LEVEL = new Set(['docParagraph', 'docHeading', 'docListItem', 'docProtected'])

function paragraphLevelNodes(node: JSONContent, out: JSONContent[] = []): JSONContent[] {
  if (node.type && PARAGRAPH_LEVEL.has(node.type)) out.push(node)
  for (const child of node.content ?? []) paragraphLevelNodes(child, out)
  return out
}

async function open() {
  const parsed = await parseDocx(await buildDocx({ bodyXml: BODY, withNumbering: true }))
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: blocksToPmDoc(parsed.blocks) as never,
  })
  return { parsed, editor }
}

describe('docxPara: the source paragraph index on editor nodes', () => {
  it('equals sourceParaIndex on top-level, cell and protected paragraphs', async () => {
    const { parsed, editor } = await open()
    const blocks = parsed.blocks.filter((b) => !b.hidden)
    const rows = blocks[1].table!.rows
    const nodes = paragraphLevelNodes(editor.getJSON())
    expect(nodes.map((n) => [n.type, n.attrs?.docxPara])).toEqual([
      ['docParagraph', blocks[0].sourceParaIndex],
      ['docParagraph', rows[0][0].richParas![0].sourceParaIndex],
      ['docParagraph', rows[0][1].richParas![0].sourceParaIndex],
      ['docParagraph', rows[1][0].richParas![0].sourceParaIndex],
      ['docListItem', rows[1][0].richParas![1].sourceParaIndex],
      // the vMerge continuation cell is not rendered
      ['docProtected', blocks[2].sourceParaIndex],
      ['docParagraph', blocks[3].sourceParaIndex],
    ])
    expect(nodes.map((n) => n.attrs?.docxPara)).toEqual([0, 1, 2, 3, 4, 6, 7])
    editor.destroy()
  })

  it('renders data-src-p on paragraphs and protected blocks', async () => {
    const { editor } = await open()
    const dom = editor.view.dom
    const marked = [...dom.querySelectorAll('[data-src-p]')].map((el) =>
      el.getAttribute('data-src-p'),
    )
    expect(marked).toEqual(['0', '1', '2', '3', '4', '6', '7'])
    expect(dom.querySelector('[data-doc-protected][data-src-p="6"]')).not.toBeNull()
    editor.destroy()
  })

  it('is null on a paragraph the user inserts', async () => {
    const { editor } = await open()
    editor.commands.insertContentAt(0, {
      type: 'docParagraph',
      content: [{ type: 'text', text: 'new' }],
    })
    const first = paragraphLevelNodes(editor.getJSON())[0]
    expect(first.content?.[0]?.text).toBe('new')
    expect(first.attrs?.docxPara).toBeNull()
    expect(editor.view.dom.querySelector('p')?.hasAttribute('data-src-p')).toBe(false)
    editor.destroy()
  })
})
