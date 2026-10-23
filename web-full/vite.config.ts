import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { familyVerticalMetrics } from '../packages/font-metrics/src/index'
const root = resolve(__dirname, '..')
const saveDir = process.env.GENOFFICE_SAVE_DIR ?? resolve(__dirname, 'saved')
function hostEndpoints(): Plugin {
  return {
    name: 'genoffice-host-endpoints',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname === '/__font-metrics') {
          const family = url.searchParams.get('family') ?? ''
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(familyVerticalMetrics(family)))
          return
        }
        if (url.pathname === '/__save' && req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (c: Buffer) => chunks.push(c))
          req.on('end', () => {
            mkdirSync(saveDir, { recursive: true })
            const name = (url.searchParams.get('name') ?? 'untitled').replace(/[^\w.-]/g, '_')
            writeFileSync(resolve(saveDir, `${name}.docx`), Buffer.concat(chunks))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, path: resolve(saveDir, `${name}.docx`) }))
          })
          return
        }
        next()
      })
    },
  }
}

// Spike-only: the host decides whether the body is editable. The desktop app locks the body when the
// document carries an enforced w:documentProtection (edit="forms" / "readOnly"); our review UI fills
// such forms on purpose, so that lock is lifted here. settings.xml keeps the protection untouched on save.
function hostDecidesEditability(): Plugin {
  return {
    name: 'genoffice-host-editability',
    transform(code, id) {
      if (!id.endsWith('/apps/docs/src/renderer/App.tsx')) return null
      const needle = 'editor.setEditable(!readMode && !isProtected)'
      if (!code.includes(needle)) throw new Error('host-editability: App.tsx gate not found, update the spike')
      return { code: code.replace(needle, 'editor.setEditable(!readMode)'), map: null }
    },
  }
}

// Spike-only fix for a GenOffice rendering bug: header/footer strips sit outside .doc-page, so runs that
// inherit the document's default (theme) font fell back to the UI font stack. Extend the per-document
// base font rule to the strips. Upstream candidate: apps/docs/src/renderer/doc-style-css.ts.
function headerStripFont(): Plugin {
  return {
    name: 'genoffice-header-strip-font',
    transform(code, id) {
      if (!id.endsWith('/apps/docs/src/renderer/doc-style-css.ts')) return null
      const re = /\.doc-page, \.pv-page \{ \$\{decls\.join\(/g
      if (!re.test(code)) throw new Error('header-strip-font: base font rule not found, update the spike')
      return { code: code.replace(re, '.doc-page, .pv-page, .page-hf { ${decls.join('), map: null }
    },
  }
}
export default defineConfig({
  root: __dirname,
  // relative asset URLs so the built host can be served under any path (e.g. /editor/)
  base: './',
  build: { outDir: resolve(__dirname, 'dist'), emptyOutDir: true, target: 'es2022' },
  plugins: [react(), hostEndpoints(), hostDecidesEditability(), headerStripFont()],
  resolve: {
    alias: {
      '@genoffice/docx-engine/lazy-media': resolve(root, 'packages/docx-engine/src/lazy-media.ts'),
      '@genoffice/docx-engine/zip-splice': resolve(root, 'packages/docx-engine/src/zip-splice.ts'),
      '@genoffice/docx-engine': resolve(root, 'packages/docx-engine/src/index.ts'),
    },
  },
  server: { port: 5201, strictPort: true, fs: { allow: [root] } },
})
