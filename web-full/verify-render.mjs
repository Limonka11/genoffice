// Prints DOCX files through dist/render.html in headless Chromium and checks every PDF against the editor's
// own pagination: same page count, same paper size per page. Run after `npm run build:web-host`:
//   node web-full/verify-render.mjs [file-or-dir ...]     (default: every .docx in the repo)
// RENDER_OUT=<dir> keeps the PDFs; RENDER_JOBS=<n> pages in parallel (default 3); CHROMIUM_PATH=<binary> runs
// another Chromium than Playwright's own.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { PDFDocument } from 'pdf-lib'
import { preview } from 'vite'

const root = resolve(import.meta.dirname, '..')
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report'])
const SIZE_TOLERANCE_PT = 1
const EXPECTED_FAILURES = {
  'apps/docs/tests/encrypted-fixtures/office-agile-password.docx': 'parse_failed',
  'apps/docs/tests/encrypted-fixtures/office-standard-password.docx': 'parse_failed',
}
const outDir = process.env.RENDER_OUT
const jobs = Number(process.env.RENDER_JOBS ?? 3)

function docxFiles(path) {
  if (statSync(path).isFile()) return path.endsWith('.docx') ? [path] : []
  return readdirSync(path)
    .filter((name) => !SKIP_DIRS.has(name) && !name.startsWith('~$'))
    .flatMap((name) => docxFiles(join(path, name)))
}

async function pdfPages(bytes) {
  const pdf = await PDFDocument.load(bytes)
  return pdf.getPages().map((page) => page.getSize())
}

function compare(result, sizes) {
  if (sizes.length !== result.pageCount)
    return `PDF has ${sizes.length} pages, editor laid out ${result.pageCount}`
  const off = sizes.findIndex(({ width, height }, i) => {
    const want = result.pages[i]
    return (
      Math.abs(width - want.widthPt) > SIZE_TOLERANCE_PT ||
      Math.abs(height - want.heightPt) > SIZE_TOLERANCE_PT
    )
  })
  if (off === -1) return null
  const want = result.pages[off]
  return `page ${off + 1} is ${sizes[off].width}x${sizes[off].height}pt, editor ${want.widthPt}x${want.heightPt}pt`
}

async function verify(browser, url, file) {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  try {
    await page.goto(url)
    const base64 = readFileSync(file).toString('base64')
    const started = Date.now()
    const result = await page.evaluate(
      ([bytes, name]) => globalThis.genofficeRender.load(bytes, { name }),
      [base64, basename(file)],
    )
    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    const expected = EXPECTED_FAILURES[relative(root, file)]
    if (result.status !== 'ready')
      return {
        file,
        ok: result.code === expected,
        seconds,
        detail: `${result.code}: ${result.message}`,
      }
    if (expected)
      return { file, ok: false, seconds, detail: `expected ${expected}, the page reported ready` }
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
    if (outDir)
      writeFileSync(join(outDir, `${relative(root, file).replaceAll('/', '__')}.pdf`), pdf)
    const mismatch = compare(result, await pdfPages(pdf))
    return { file, ok: !mismatch, seconds, pages: result.pageCount, detail: mismatch ?? '' }
  } catch (err) {
    return { file, ok: false, seconds: '-', detail: `driver error: ${err.message.split('\n')[0]}` }
  } finally {
    await page.close()
  }
}

const args = process.argv.slice(2)
const files = (args.length > 0 ? args.map((a) => resolve(a)) : [root]).flatMap(docxFiles)
if (outDir) mkdirSync(outDir, { recursive: true })
const server = await preview({
  configFile: join(root, 'web-full/vite.config.ts'),
  preview: { port: 0, open: false },
  logLevel: 'warn',
})
const url = new URL('render.html', server.resolvedUrls.local[0]).href
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const results = []
try {
  const queue = [...files]
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const r = await verify(browser, url, file)
        results.push(r)
        console.log(
          `${r.ok ? 'ok  ' : 'FAIL'} ${relative(root, r.file)} (${r.pages ?? '-'} pages, ${r.seconds}s) ${r.detail}`,
        )
      }
    }),
  )
} finally {
  await browser.close()
  await server.close()
}
const failed = results.filter((r) => !r.ok)
console.log(
  `\n${results.length - failed.length}/${results.length} documents print with the editor's page count and sizes`,
)
process.exit(failed.length > 0 ? 1 : 0)
