/**
 * postMessage contract between a host page (the Vound app) and this iframe.
 * Host → iframe:   { type: 'vound:open', name: string, bytes: ArrayBuffer }   open a document
 *                  { type: 'vound:command', command: 'save' | 'save-as' | 'undo' | 'redo' }
 * Iframe → host:   { type: 'vound:ready' }                                     the editor subscribed to open requests
 *                  { type: 'vound:saved', name: string, bytes: ArrayBuffer }   every save (⌘S, File › Save, 'save' command)
 *                  { type: 'vound:error', message: string }
 * Bytes travel as transferable ArrayBuffers; the host must check event.origin.
 */
export type HostToEditor =
  | { type: 'vound:open'; name: string; bytes: ArrayBuffer }
  | { type: 'vound:command'; command: 'save' | 'save-as' | 'undo' | 'redo' }
export type EditorToHost =
  | { type: 'vound:ready' }
  | { type: 'vound:saved'; name: string; bytes: ArrayBuffer }
  | { type: 'vound:error'; message: string }
export const isEmbedded = (): boolean => window.parent !== window
