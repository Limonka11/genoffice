/**
 * postMessage contract between a host page (the Vound app) and this iframe.
 * Host → iframe:   { type: 'vound:open', name: string, bytes: ArrayBuffer }   open a document
 *                  { type: 'vound:command', command: 'save' }                 save now (same path as ⌘S)
 * Iframe → host:   { type: 'vound:ready' }                                     the editor subscribed to open requests
 *                  { type: 'vound:saved', name: string, bytes: ArrayBuffer }   every save (⌘S, File › Save, 'save' command)
 *                  { type: 'vound:dirty', dirty: boolean }                     unsaved changes appeared or were saved; sent on change
 *                  { type: 'vound:error', message: string }                    open or save failed
 *
 * Both sides check the sender. The editor accepts a message only when event.origin is its own origin
 * and event.source is window.parent (embedMessages.ts); the host should accept one only from the
 * iframe's contentWindow on its own origin. Both post with targetOrigin = window.location.origin, so
 * host and editor have to be served from the same origin. Bytes travel as transferable ArrayBuffers.
 */
export type HostToEditor =
  | { type: 'vound:open'; name: string; bytes: ArrayBuffer }
  | { type: 'vound:command'; command: 'save' }
export type EditorToHost =
  | { type: 'vound:ready' }
  | { type: 'vound:saved'; name: string; bytes: ArrayBuffer }
  | { type: 'vound:dirty'; dirty: boolean }
  | { type: 'vound:error'; message: string }
export const isEmbedded = (): boolean => window.parent !== window
