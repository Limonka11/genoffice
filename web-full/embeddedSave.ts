// A save while embedded: the host owns persistence, and every vound:saved it receives becomes a
// published revision with a server-side render. So only an explicit save (⌘S, File › Save, the 'save'
// command) reaches it. An auto save (the app's saveDocx(path, data, auto = true)) posts nothing and
// answers like an autosave that deferred to a manual save: the document stays unsaved, with no error
// banner. Answering ok would mark it clean and tell the host vound:dirty false for edits it never got.
// An explicit save also seals the slot markers (markersPlugin.ts) before the host hears of it. The app
// re-parses the saved bytes after this returns, and the nodes then carry the saved file's paragraph
// numbering while the host's markers name the opened file's paragraphs; sealed, none can land on a
// wrong paragraph until the next open.
import type { EditorToHost } from './embed-protocol'

export function embeddedSave(
  path: string,
  data: ArrayBuffer,
  auto: boolean | undefined,
  post: (msg: EditorToHost, transfer: Transferable[]) => void,
  sealMarkers: () => void,
) {
  if (auto === true) return { ok: false, reason: 'external-modified' as const }
  sealMarkers()
  const name = path.split('/').pop()!.replace(/\.docx$/, '')
  const copy = data.slice(0)
  post({ type: 'vound:saved', name, bytes: copy }, [copy])
  return { ok: true, path }
}
