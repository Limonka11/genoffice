// The editor's side of the embed contract (embed-protocol.ts): which incoming messages it trusts and
// how it reads them. Pure, so the rules are tested without a browser.
import type { HostToEditor } from './embed-protocol'

/** Only the embedding page, and only on the editor's own origin, may drive the editor. */
export const acceptsHostMessage = (
  event: { origin: string; source: unknown },
  self: { origin: string; parent: Window },
) => event.origin === self.origin && event.source === self.parent

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** The host message in `data`, or null when it is not one of the two the editor accepts. */
export function readHostMessage(data: unknown): HostToEditor | null {
  if (!isRecord(data)) return null
  if (data.type === 'vound:open' && typeof data.name === 'string' && data.bytes instanceof ArrayBuffer)
    return { type: 'vound:open', name: data.name, bytes: data.bytes }
  if (data.type === 'vound:command' && data.command === 'save') return { type: 'vound:command', command: 'save' }
  return null
}
