// Room for the field chip (fieldChip.ts) right of the page in review mode. host.css puts the page at the
// left of the canvas, so all spare width lies right of it, and the app's fit-to-width zoom (App.tsx
// rawFitWidth and fitZoomFor, patched by the reviewFitZoom transform in vite.config.ts) fits the page into
// the canvas less GUTTER_RESERVE_PX and never above 100 %. A canvas narrower than the page plus the reserve
// therefore zooms the page out instead of covering the gutter, also when the app locked into fit mode.

/** the chip's distance from the page's right edge */
export const PAGE_GAP_PX = 10
/** the room the gutter keeps beyond the chip */
export const GUTTER_SLACK_PX = 16
/** host.css .vound-chip: 24px buttons 2px apart, 3px padding and a 1px border on each side */
const BUTTON_PX = 24
const BUTTON_GAP_PX = 2
const CHIP_FRAME_PX = 2 * 3 + 2 * 1

/** the narrowest a chip row with this many buttons can be (its label shrinks or wraps above them) */
export const chipRowWidth = (buttons: number) => buttons * BUTTON_PX + (buttons - 1) * BUTTON_GAP_PX + CHIP_FRAME_PX

/** what the width fit keeps free right of the page: a two-button chip, its distance and its slack */
export const GUTTER_RESERVE_PX = PAGE_GAP_PX + chipRowWidth(2) + GUTTER_SLACK_PX
/** the highest zoom (%) a fit reaches in review mode */
export const REVIEW_MAX_FIT_ZOOM = 100

/** the canvas width (px) the app's width fit may fill: all of it, or less the chip's gutter in review mode */
export const reviewFitWidth = (canvasWidth: number, review: boolean) =>
  review ? Math.max(0, canvasWidth - GUTTER_RESERVE_PX) : canvasWidth

/** a fitted zoom (%), capped in review mode */
export const reviewFitZoom = (zoom: number, review: boolean) => (review ? Math.min(zoom, REVIEW_MAX_FIT_ZOOM) : zoom)

/** the widest a chip may be in a gutter this wide (px from the page's right edge to the canvas edge) */
export const chipRoom = (gutter: number) => gutter - PAGE_GAP_PX - GUTTER_SLACK_PX
