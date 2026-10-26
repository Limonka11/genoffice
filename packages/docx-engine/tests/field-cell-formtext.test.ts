import { describe, expect, it } from 'vitest'
import { patchTableCellTexts } from '../src/index'

// A legacy text form field in a table cell, as the editor's cell text patch sees it (Vound fork): a rich
// run patch for the field's paragraph keeps the field machinery byte for byte around the changed w:t.
const RPR = '<w:rPr><w:b/></w:rPr>'
const FIELD_HEAD =
  `<w:r>${RPR}<w:fldChar w:fldCharType="begin"><w:ffData><w:name w:val="Firma"/><w:enabled/><w:textInput/></w:ffData></w:fldChar></w:r>` +
  `<w:r>${RPR}<w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r><w:r>${RPR}<w:fldChar w:fldCharType="separate"/></w:r>`
const FIELD_END = `<w:r>${RPR}<w:fldChar w:fldCharType="end"/></w:r>`
const fieldParagraph = (...result: string[]) =>
  `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${FIELD_HEAD}${result.map((t) => `<w:r>${RPR}<w:t xml:space="preserve">${t}</w:t></w:r>`).join('')}${FIELD_END}</w:p>`
const table = (paragraph: string) =>
  `<w:tbl><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${paragraph}</w:tc></w:tr></w:tbl>`

/** the patched table for a new result text in the cell's field paragraph */
const patched = (paragraph: string, text: string) => patchTableCellTexts(table(paragraph), [[[{ runs: [{ text }] }]]])
/** the table with the field's result w:t texts replaced, everything else as it was */
const expected = (...result: string[]) => table(fieldParagraph(...result))

describe('a FORMTEXT field in a table cell (Vound fork)', () => {
  it('empties, shortens and replaces the result inside the field, nothing else changes', () => {
    const filled = fieldParagraph('Muster Ingenieure GmbH')
    expect(patched(filled, '')).toBe(expected(''))
    expect(patched(filled, 'Muster GmbH')).toBe(expected('Muster GmbH'))
    expect(patched(filled, 'Beispiel AG')).toBe(expected('Beispiel AG'))
  })

  it("writes Word's empty result (en spaces) and replaces it again", () => {
    const enSpaces = '\u2002'.repeat(5)
    expect(patched(fieldParagraph('Muster GmbH'), enSpaces)).toBe(expected(enSpaces))
    // Word's own empty field: one en space per run; a value spreads over them inside the result
    const blank = fieldParagraph(...enSpaces.split(''))
    const out = patched(blank, 'Muster GmbH')
    const separate = 'w:fldCharType="separate"/></w:r>'
    const result = out.slice(out.indexOf(separate) + separate.length, out.indexOf(FIELD_END))
    expect(result.replace(/<[^>]+>/g, '')).toBe('Muster GmbH')
    // outside the result everything is as it was
    expect(out.replace(result, '')).toBe(table(fieldParagraph()))
  })
})
