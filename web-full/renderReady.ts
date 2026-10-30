import { waitForFullContent } from '../apps/docs/src/renderer/phased-content'
import { failedDownloadedFonts } from './renderFonts'
import type { RenderFailureCode, RenderResult } from './render-protocol'
import { namedPages, renderPage, type PageBox } from './renderPages'

declare global {
  interface Window {
    __pageDebug?: { slices?: unknown[] }
    __openPagePreview?: () => void
  }
}

/** document.title before the app has a document (App.tsx) */
export const NO_DOCUMENT_TITLE = 'GenOffice Docs'
const POLL_MS = 300
const STABLE_POLLS = 3

class RenderError extends Error {
  constructor(
    readonly code: RenderFailureCode,
    message: string,
  ) {
    super(message)
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const sliceCount = () => window.__pageDebug?.slices?.length ?? 0
const previewPages = () => [
  ...document.querySelectorAll<HTMLElement>('.pagination-preview .pv-page'),
]

async function poll(done: () => boolean) {
  while (!done()) await sleep(POLL_MS)
}

/** Resolves once `read` returned the same positive value STABLE_POLLS times in a row. */
async function stableCount(read: () => number) {
  let last = -1
  let seen = 0
  while (seen < STABLE_POLLS) {
    const count = read()
    seen = count > 0 && count === last ? seen + 1 : 1
    last = count
    await sleep(POLL_MS)
  }
}

async function documentOpened(name: string) {
  await poll(() => document.title !== NO_DOCUMENT_TITLE)
  if (document.title !== name)
    throw new RenderError(
      'parse_failed',
      `the document did not open; the editor fell back to "${document.title}"`,
    )
}

async function imagesLoaded() {
  const images = [
    ...document.querySelectorAll<HTMLImageElement>('.pagination-preview img[src]:not([src=""])'),
  ]
  const failed: string[] = []
  await Promise.all(
    images.map((img) => {
      img.loading = 'eager'
      return img.decode().catch(() => failed.push(img.currentSrc.slice(0, 80)))
    }),
  )
  if (failed.length > 0)
    throw new RenderError(
      'image_load_failed',
      `${failed.length} image(s) did not load: ${failed.join(', ')}`,
    )
}

async function fontsLoaded() {
  await document.fonts.ready
  const failed = failedDownloadedFonts()
  if (failed.length > 0)
    throw new RenderError('font_load_failed', `font(s) did not load: ${failed.join(', ')}`)
}

async function previewMatchesLayout() {
  await stableCount(() => (previewPages().length === sliceCount() ? sliceCount() : 0))
}

function printEachPageAtItsSize(pages: HTMLElement[]): PageBox[] {
  const boxes = pages.map((page) => ({
    widthPx: parseFloat(page.style.width),
    heightPx: parseFloat(page.style.height),
  }))
  const { css, names } = namedPages(boxes)
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
  pages.forEach((page, i) => page.style.setProperty('page', names[i]))
  return boxes
}

async function layOut(name: string, progress: { stage: string }): Promise<RenderResult> {
  progress.stage = 'opening the document'
  await documentOpened(name)
  progress.stage = 'loading the rest of the document'
  await waitForFullContent()
  progress.stage = 'loading fonts'
  await document.fonts.ready
  progress.stage = 'paginating'
  await stableCount(sliceCount)
  progress.stage = 'building the page preview'
  window.__openPagePreview?.()
  await poll(() => previewPages().length > 0)
  progress.stage = 'loading images'
  await imagesLoaded()
  progress.stage = 'loading fonts'
  await fontsLoaded()
  progress.stage = 'settling the page preview'
  await previewMatchesLayout()
  const boxes = printEachPageAtItsSize(previewPages())
  return { status: 'ready', pageCount: sliceCount(), pages: boxes.map(renderPage) }
}

/** Waits until the opened document is laid out and printable, or fails with a typed code by the deadline. */
export async function renderWhenReady(name: string, timeoutMs: number): Promise<RenderResult> {
  const progress = { stage: 'starting' }
  const timeout = sleep(timeoutMs).then((): RenderResult => ({
    status: 'failed',
    code: 'layout_timeout',
    message: `not ready after ${timeoutMs} ms while ${progress.stage}`,
  }))
  const rendered = layOut(name, progress).catch((err: unknown): RenderResult => {
    if (err instanceof RenderError)
      return { status: 'failed', code: err.code, message: err.message }
    return { status: 'failed', code: 'unexpected_error', message: String(err) }
  })
  return Promise.race([rendered, timeout])
}
