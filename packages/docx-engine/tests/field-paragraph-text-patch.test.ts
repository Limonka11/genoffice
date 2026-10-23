import { describe, expect, test } from 'vitest'
import { patchFieldParagraphText } from '../src/text-patch'

const formtext =
  '<w:p><w:r><w:fldChar w:fldCharType="begin"><w:ffData><w:name w:val="Text1"/><w:enabled/><w:textInput/></w:ffData></w:fldChar></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  '<w:r><w:rPr><w:b/></w:rPr><w:t>(Firma)</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'

const placeholder =
  '<w:p><w:r><w:t>Vergabe-Nr:</w:t></w:r><w:r><w:tab/></w:r>' +
  '<w:sdt><w:sdtPr><w:id w:val="7"/><w:showingPlcHdr/><w:text/></w:sdtPr><w:sdtContent>' +
  '<w:r><w:rPr><w:rStyle w:val="Platzhaltertext"/></w:rPr><w:t>Klicken Sie hier</w:t></w:r></w:sdtContent></w:sdt></w:p>'

describe('patchFieldParagraphText (Vound fork)', () => {
  test('a text edit inside a FORMTEXT result keeps the field machinery', () => {
    const out = patchFieldParagraphText(formtext, [{ text: 'Vound GmbH' }])
    expect(out).not.toBeNull()
    expect(out).toContain('<w:ffData>')
    expect(out).toContain('FORMTEXT')
    expect(out).toContain('fldCharType="end"')
    expect(out).toContain('<w:rPr><w:b/></w:rPr>')
    expect(out).toContain('>Vound GmbH</w:t>')
    expect(out).not.toContain('(Firma)')
  })
  test('typing into a placeholder control keeps the control and drops the placeholder flag and style', () => {
    const out = patchFieldParagraphText(placeholder, [{ text: 'Vergabe-Nr:\t2026-1' }])
    expect(out).not.toBeNull()
    expect(out).toContain('<w:sdt>')
    expect(out).toContain('<w:tab/>')
    expect(out).toContain('>2026-1</w:t>')
    expect(out).not.toContain('showingPlcHdr')
    expect(out).not.toContain('Platzhaltertext')
  })
  test('a control whose text did not change keeps its placeholder flag', () => {
    // the edit sits inside the first run; an insertion exactly at the control boundary is
    // ambiguous and may be attributed to the control (then the flag goes, as if typed into it)
    const out = patchFieldParagraphText(placeholder, [{ text: 'Vergabe NEU-Nr:\tKlicken Sie hier' }])
    expect(out).not.toBeNull()
    expect(out).toContain('showingPlcHdr')
  })
  test('falls back when a tab was added or removed, or when there is no field', () => {
    expect(patchFieldParagraphText(placeholder, [{ text: 'Vergabe-Nr:2026' }])).toBeNull()
    expect(patchFieldParagraphText('<w:p><w:r><w:t>plain</w:t></w:r></w:p>', [{ text: 'x' }])).toBeNull()
  })
  test('falls back for a checkbox glyph that has no w:t to map onto', () => {
    const checkbox =
      '<w:p><w:r><w:fldChar w:fldCharType="begin"><w:ffData><w:checkBox><w:default w:val="0"/></w:checkBox></w:ffData></w:fldChar></w:r>' +
      '<w:r><w:instrText> FORMCHECKBOX </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
    expect(patchFieldParagraphText(checkbox, [{ text: '☒' }])).toBeNull()
  })
})
