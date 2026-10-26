import { describe, expect, it } from 'vitest'
import { chipRoom, chipRowWidth, GUTTER_RESERVE_PX, PAGE_GAP_PX, reviewFitWidth, reviewFitZoom } from '../reviewGutter'

/** the scroll container's padding left and right of the page (styles.css .editor-scroll) */
const CANVAS_PAD = 24
const A4 = 793.7
const LETTER = 816

/** App.tsx at a canvas this wide in review mode: the overflow clamp compares the 100 % it starts at with
 *  rawFitWidth and refits to fitZoomFor('width'); a locked fit mode refits to fitZoomFor('width') too */
function reviewZoom(canvasWidth: number, pageWidth: number) {
  const raw = ((reviewFitWidth(canvasWidth, true) - 48) / pageWidth) * 100
  const fitted = Math.floor(reviewFitZoom(raw, true))
  return { clamped: 100 > raw + 0.5 ? fitted : 100, locked: fitted }
}
/** the gutter right of a left-aligned page at this zoom */
const leftAlignedGutter = (canvasWidth: number, pageWidth: number, zoom: number) =>
  canvasWidth - CANVAS_PAD - (pageWidth * zoom) / 100

describe('review gutter', () => {
  it('reserves a two-button chip, its distance from the page and its slack', () => {
    expect(chipRowWidth(2)).toBe(58)
    expect(GUTTER_RESERVE_PX).toBe(PAGE_GAP_PX + 58 + 16)
    expect(chipRoom(GUTTER_RESERVE_PX)).toBe(chipRowWidth(2))
  })

  it.each([860, 900, 1000, 1200, 1600, 2400])('a %ipx canvas leaves the chip room right of a left-aligned page', (width) => {
    for (const page of [A4, LETTER]) {
      for (const zoom of Object.values(reviewZoom(width, page))) {
        expect(zoom).toBeLessThanOrEqual(100)
        expect(chipRoom(leftAlignedGutter(width, page, zoom))).toBeGreaterThanOrEqual(chipRowWidth(2))
      }
    }
  })

  it('at 900 and 1000px: zoomed out a little, and a centred page would not have had the room', () => {
    expect(reviewZoom(900, A4)).toEqual({ clamped: 96, locked: 96 })
    expect(reviewZoom(1000, A4)).toEqual({ clamped: 100, locked: 100 })
    const centredGutter = (900 - A4 * 0.96) / 2
    expect(chipRoom(centredGutter)).toBeLessThan(chipRowWidth(2))
    expect(chipRoom(leftAlignedGutter(900, A4, 96))).toBeGreaterThanOrEqual(chipRowWidth(2))
  })

  it('never fits above 100 % in review mode, and changes nothing outside it', () => {
    expect(reviewFitZoom(175, true)).toBe(100)
    expect(reviewFitZoom(80, true)).toBe(80)
    expect(reviewZoom(2400, A4).locked).toBe(100)
    expect(reviewFitZoom(175, false)).toBe(175)
    expect(reviewFitWidth(900, false)).toBe(900)
    expect(reviewFitWidth(900, true)).toBe(900 - GUTTER_RESERVE_PX)
    expect(reviewFitWidth(40, true)).toBe(0)
  })
})
