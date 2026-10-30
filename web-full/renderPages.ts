import type { RenderPage } from './render-protocol'

export type PageBox = { widthPx: number; heightPx: number }

const PT_PER_PX = 72 / 96
const toPt = (px: number) => Math.round(px * PT_PER_PX * 100) / 100

export const renderPage = ({ widthPx, heightPx }: PageBox): RenderPage => ({
  widthPt: toPt(widthPx),
  heightPt: toPt(heightPx),
  orientation: widthPx > heightPx ? 'landscape' : 'portrait',
})

/** One named @page per distinct paper size, and the page name each sheet prints on. */
export function namedPages(boxes: PageBox[]): { css: string; names: string[] } {
  const sizes = [...new Set(boxes.map((b) => `${b.widthPx}px ${b.heightPx}px`))]
  const rules = sizes.map((size, i) => `@page sheet${i} { size: ${size}; margin: 0 }`)
  return {
    css: ['@page { margin: 0 }', ...rules].join('\n'),
    names: boxes.map((b) => `sheet${sizes.indexOf(`${b.widthPx}px ${b.heightPx}px`)}`),
  }
}
