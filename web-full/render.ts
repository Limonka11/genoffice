import { installDesktopShim, fileResult } from './shim'
import type { GenofficeRender, RenderResult } from './render-protocol'
import { renderWhenReady } from './renderReady'
import './render.css'

declare global {
  interface Window {
    genofficeRender: GenofficeRender
  }
}

const DEFAULT_TIMEOUT_MS = 120_000
let submitDocument: (file: File) => void = () => {}
const documentToOpen = new Promise<File>((resolve) => {
  submitDocument = resolve
})
let loadCalled = false

const toBytes = (bytes: ArrayBuffer | string) =>
  typeof bytes === 'string'
    ? Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))
    : new Uint8Array(bytes)

// the app's boot open waits for load(): no blank document is laid out first
installDesktopShim({
  consumePendingOpenDocx: () => documentToOpen.then(fileResult),
  consumeNewBlankDoc: async () => false,
})

window.genofficeRender = {
  load: async (
    bytes,
    { name = 'document.docx', timeoutMs = DEFAULT_TIMEOUT_MS } = {},
  ): Promise<RenderResult> => {
    if (loadCalled)
      return {
        status: 'failed',
        code: 'already_loaded',
        message: 'render.html renders one document; reload it for the next',
      }
    loadCalled = true
    const fileName = name.endsWith('.docx') ? name : `${name}.docx`
    submitDocument(new File([toBytes(bytes)], fileName))
    return renderWhenReady(fileName, timeoutMs)
  },
}

void import('../apps/docs/src/renderer/main.tsx')
