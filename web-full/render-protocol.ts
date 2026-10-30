/**
 * Contract of render.html, the headless page that prints a DOCX with the editor's own layout.
 *
 *   const result = await window.genofficeRender.load(bytes, { name?, timeoutMs? })
 *
 * `bytes` is the .docx as an ArrayBuffer or a base64 string (what a CDP driver can pass). The page is
 * single-use: load once, then print with `page.pdf({ preferCSSPageSize: true, printBackground: true })`
 * at device scale factor 1. Each laid-out page prints as one PDF page at its own paper size.
 */
export type RenderFailureCode =
  | 'parse_failed'
  | 'layout_timeout'
  | 'font_load_failed'
  | 'image_load_failed'
  | 'already_loaded'
  | 'unexpected_error'
/** One laid-out page: its paper size in PDF points (1/72 in). */
export type RenderPage = {
  widthPt: number
  heightPt: number
  orientation: 'portrait' | 'landscape'
}
export type RenderResult =
  | { status: 'ready'; pageCount: number; pages: RenderPage[] }
  | { status: 'failed'; code: RenderFailureCode; message: string }
export type RenderOptions = { name?: string; timeoutMs?: number }
export type GenofficeRender = {
  load: (bytes: ArrayBuffer | string, options?: RenderOptions) => Promise<RenderResult>
}
