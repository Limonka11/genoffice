import { describe, expect, it } from 'vitest'
import { parseDocx, patchFieldParagraphXml } from '../src/index'
import { buildDocx } from './helpers/build-docx'

// An empty legacy text form field as Word writes it: its result is five en spaces, one per run.
const BLANK_FORMTEXT =
  '<w:p><w:r><w:fldChar w:fldCharType="begin"><w:ffData><w:name w:val="Text2"/><w:enabled/><w:textInput/></w:ffData></w:fldChar></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  '<w:r><w:t>\u2002</w:t></w:r><w:r><w:t>\u2002</w:t></w:r><w:r><w:t>\u2002</w:t></w:r>' +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'

describe('a blank legacy text form field (Vound fork)', () => {
  it('parses as a text field with an empty result on its empty line, so it can be typed into', async () => {
    const doc = await parseDocx(await buildDocx({ bodyXml: BLANK_FORMTEXT }))
    expect(doc.blocks[0].fieldDisplay).toMatchObject({ kind: 'text', left: '', emptyLine: true })
    // unlike a lone field end, it has result text to take a value
    expect(doc.blocks[0].fieldDisplay?.fieldEndOnly).toBeUndefined()
  })

  it('takes a typed result inside the field result and keeps the field machinery', () => {
    const out = patchFieldParagraphXml(BLANK_FORMTEXT, { left: 'Muster GmbH' })
    const separate = 'fldCharType="separate"/>'
    const result = out.slice(out.indexOf(separate) + separate.length, out.indexOf('<w:fldChar w:fldCharType="end"'))
    expect(result.replace(/<[^>]+>/g, '')).toBe('Muster GmbH')
    expect(out).toContain('<w:ffData>')
    expect(out).toContain(' FORMTEXT ')
  })

  it('leaves a blank result with a line break, a blank non-form field, and text runs outside the field as they were', async () => {
    const withBreak = BLANK_FORMTEXT.replace('<w:r><w:fldChar w:fldCharType="end"/>', '<w:r><w:br/></w:r><w:r><w:fldChar w:fldCharType="end"/>')
    const page = BLANK_FORMTEXT.replace(' FORMTEXT ', ' PAGE ')
    // a save spreads the new result over every w:t of the paragraph (patchFieldParagraphXml): a space run
    // before or after the field would take part of the typed text outside the field result
    const space = '<w:r><w:t xml:space="preserve"> </w:t></w:r>'
    const trailingSpace = BLANK_FORMTEXT.replace('</w:p>', `${space}</w:p>`)
    const leadingSpace = BLANK_FORMTEXT.replace('<w:p>', `<w:p>${space}`)
    for (const bodyXml of [withBreak, page, trailingSpace, leadingSpace]) {
      const doc = await parseDocx(await buildDocx({ bodyXml }))
      expect(doc.blocks[0].fieldDisplay?.emptyLine).toBeUndefined()
    }
  })
})
