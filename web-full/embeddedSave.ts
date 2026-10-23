// A save while embedded: the host owns persistence, and every vound:saved it receives becomes a
// published revision with a server-side render. So only an explicit save (⌘S, File › Save, the 'save'
// command) reaches it. An auto save (the app's saveDocx(path, data, auto = true)) posts nothing and
// answers like an autosave that deferred to a manual save: the document stays unsaved, with no error
// banner. Answering ok would mark it clean and tell the host vound:dirty false for edits it never got.
import type { EditorToHost } from './embed-protocol'

export function embeddedSave(
  path: string,
  data: ArrayBuffer,
  auto: boolean | undefined,
  post: (msg: EditorToHost, transfer: Transferable[]) => void,
) {
  if (auto === true) return { ok: false, reason: 'external-modified' as const }
  const name = path.split('/').pop()!.replace(/\.docx$/, '')
  const copy = data.slice(0)
  post({ type: 'vound:saved', name, bytes: copy }, [copy])
  return { ok: true, path }
}
