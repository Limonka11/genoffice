// Browser stand-in for the Electron preload bridge (window.desktop) of the Docs app.
// Open: a browser file picker (File > Open) or a sample from /samples (?doc=name, or the host panel).
// Save: every save is POSTed to the dev server (GENOFFICE_SAVE_DIR) and offered as a browser download.
// Font metrics: answered by the dev server with the same @genoffice/font-metrics package the desktop uses.
import { isEmbedded, type EditorToHost, type HostToEditor } from './embed-protocol'
type Handler = (...args: unknown[]) => void
const calls: string[] = []
let openHandler: Handler | null = null
let menuHandler: Handler | null = null
const embedded = isEmbedded()
const toHost = (msg: EditorToHost, transfer: Transferable[] = []) => { if (embedded) window.parent.postMessage(msg, '*', transfer) }
const params = new URLSearchParams(location.search)
const docName = params.get('doc')
const lastSave: { name: string; bytes: Uint8Array | null; url: string | null } = { name: '', bytes: null, url: null }
const sampleResult = (name: string) => ({ path: `/samples/${name}.docx`, name: `${name}.docx`, dataUrl: `/samples/${name}.docx`, hash: '' })
const fileResult = (file: File) => ({ path: `/local/${file.name}`, name: file.name, dataUrl: URL.createObjectURL(file), hash: '' })
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.docx'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    // no change event fires on cancel in every browser; a focus return without a file counts as cancel
    window.addEventListener('focus', () => setTimeout(() => resolve(input.files?.[0] ?? null), 400), { once: true })
    input.click()
  })
}
function download(name: string, bytes: Uint8Array) {
  if (lastSave.url) URL.revokeObjectURL(lastSave.url)
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
  lastSave.url = url
  const a = document.createElement('a'); a.href = url; a.download = name.endsWith('.docx') ? name : `${name}.docx`; a.click()
}
async function persist(path: string, data: ArrayBuffer, triggerDownload: boolean) {
  const name = path.split('/').pop()!.replace(/\.docx$/, '')
  lastSave.name = name; lastSave.bytes = new Uint8Array(data)
  if (embedded) {
    // the host owns persistence: hand it a copy of the bytes and report success
    const copy = data.slice(0)
    toHost({ type: 'vound:saved', name, bytes: copy }, [copy])
    return { ok: true, path }
  }
  const res = await fetch(`/__save?name=${encodeURIComponent(name)}`, { method: 'POST', body: data }).catch(() => null)
  if (triggerDownload) download(name, lastSave.bytes)
  return { ok: !!res && res.ok, path }
}
const known: Record<string, unknown> = {
  getLanguage: async () => 'en',
  getTheme: async () => 'light',
  getDocumentTheme: async () => 'follow',
  getSystemLocale: async () => 'en-US',
  getAuthorName: async () => 'Reviewer',
  getAiPanelPrefs: async () => ({}),
  getAiSettings: async () => ({}),
  getRecentFiles: async () => [],
  getAutoSaveDefault: async () => false,
  args: async () => [],
  cwd: async () => '/',
  allowedRoots: async () => [],
  listPrinters: async () => [],
  kbList: async () => [],
  listDocsTabs: async () => [],
  consumePendingOpenDocx: async () => (docName ? sampleResult(docName) : null),
  consumeNewBlankDoc: async () => !docName,
  consumeAiDocContent: async () => null,
  consumeHeadlessExport: async () => null,
  fontMetrics: async (family: string) => {
    const res = await fetch(`/__font-metrics?family=${encodeURIComponent(family)}`)
    return res.ok ? res.json() : null
  },
  // File > Open
  openDocx: async () => { const f = await pickFile(); return f ? fileResult(f) : null },
  openDocxPath: async (path: string) => sampleResult(path.split('/').pop()!.replace(/\.docx$/, '')),
  // Save (Cmd+S) writes to the server folder and downloads; Save As / first save of a new doc do the same
  saveDocx: (path: string, data: ArrayBuffer) => persist(path, data, true),
  saveDocxAs: (defaultName: string, data: ArrayBuffer) => persist(`/local/${defaultName}`, data, true),
  saveDocxNew: (defaultName: string, data: ArrayBuffer) => persist(`/local/${defaultName}`, data, true),
  saveDocxTo: (path: string, data: ArrayBuffer) => persist(path, data, false),
  writeRecoveryCopy: async () => ({ ok: true }),
  onOpenDocx: (h: Handler) => { openHandler = h; if (embedded) toHost({ type: 'vound:ready' }); return () => { openHandler = null } },
  onMenuCommand: (h: Handler) => { menuHandler = h; return () => { menuHandler = null } },
}
export function installDesktopShim() {
  const w = window as unknown as Record<string, unknown>
  w.desktop = new Proxy(known, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (key in target) return target[key]
      if (key.startsWith('on')) return () => () => {}
      return async (...args: unknown[]) => { calls.push(`${key}(${args.length})`); return undefined }
    },
  })
  const api = {
    calls,
    lastSave,
    openSample: (name: string) => { if (!openHandler) throw new Error('App has not subscribed to onOpenDocx yet'); openHandler(sampleResult(name)) },
    openFile: async () => { const f = await pickFile(); if (f && openHandler) openHandler(fileResult(f)) },
    downloadLastSave: () => { if (lastSave.bytes) download(lastSave.name, lastSave.bytes) },
  }
  w.__full = api
  if (embedded) {
    window.addEventListener('message', (event: MessageEvent<HostToEditor>) => {
      const msg = event.data
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string' || !msg.type.startsWith('vound:')) return
      if (msg.type === 'vound:open') {
        const file = new File([msg.bytes], msg.name.endsWith('.docx') ? msg.name : `${msg.name}.docx`)
        if (openHandler) openHandler(fileResult(file))
        else toHost({ type: 'vound:error', message: 'editor not ready for open yet' })
      } else if (msg.type === 'vound:command') {
        if (menuHandler) menuHandler(msg.command)
        else toHost({ type: 'vound:error', message: 'editor has no command handler yet' })
      }
    })
  }
  return api
}
