import { describe, expect, it } from 'vitest'
import { namedPages, renderPage } from '../renderPages'

const a4 = { widthPx: 793.7, heightPx: 1122.5 }
const letterLandscape = { widthPx: 1056, heightPx: 816 }

describe('renderPage', () => {
  it('reports the paper size in points and its orientation', () => {
    expect(renderPage(a4)).toEqual({ widthPt: 595.28, heightPt: 841.88, orientation: 'portrait' })
    expect(renderPage(letterLandscape)).toEqual({
      widthPt: 792,
      heightPt: 612,
      orientation: 'landscape',
    })
  })
})

describe('namedPages', () => {
  it('gives each distinct paper size one named @page with no margin', () => {
    const { css, names } = namedPages([a4, a4, letterLandscape, a4])
    expect(names).toEqual(['sheet0', 'sheet0', 'sheet1', 'sheet0'])
    expect(css).toBe(
      [
        '@page { margin: 0 }',
        '@page sheet0 { size: 793.7px 1122.5px; margin: 0 }',
        '@page sheet1 { size: 1056px 816px; margin: 0 }',
      ].join('\n'),
    )
  })
})
