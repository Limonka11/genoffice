// The editor's side of the embed contract (embed-protocol.ts): which incoming messages it trusts and
// how it reads them. Pure, so the rules are tested without a browser.
import type { HostToEditor, MarkerTone, SlotMarker } from './embed-protocol'

/** Only the embedding page, and only on the editor's own origin, may drive the editor. */
export const acceptsHostMessage = (
  event: { origin: string; source: unknown },
  self: { origin: string; parent: Window },
) => event.origin === self.origin && event.source === self.parent

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const markerTones: MarkerTone[] = ['proposed', 'gap', 'conditional', 'refused', 'accepted', 'rejected']

/** One marker with exactly the known fields, or null when a field is missing or out of range. */
function readMarker(value: unknown): SlotMarker | null {
  if (!isRecord(value)) return null
  const { id, paragraph, scope, tone } = value
  if (typeof id !== 'string') return null
  if (typeof paragraph !== 'number' || !Number.isInteger(paragraph) || paragraph < 0) return null
  if (scope !== 'paragraph' && scope !== 'cell') return null
  const knownTone = markerTones.find((known) => known === tone)
  if (!knownTone) return null
  return { id, paragraph, scope, tone: knownTone }
}

/** All markers, or null when the list is not an array or any one entry is malformed. */
function readMarkers(value: unknown): SlotMarker[] | null {
  if (!Array.isArray(value)) return null
  const markers = value.map(readMarker)
  return markers.every((marker): marker is SlotMarker => marker !== null) ? markers : null
}

/** The host message in `data`, or null when it is not one the editor accepts. */
export function readHostMessage(data: unknown): HostToEditor | null {
  if (!isRecord(data)) return null
  if (data.type === 'vound:open' && typeof data.name === 'string' && data.bytes instanceof ArrayBuffer)
    return { type: 'vound:open', name: data.name, bytes: data.bytes }
  if (data.type === 'vound:command' && data.command === 'save') return { type: 'vound:command', command: 'save' }
  if (data.type === 'vound:markers') {
    const markers = readMarkers(data.markers)
    return markers ? { type: 'vound:markers', markers } : null
  }
  if (data.type === 'vound:scrollTo' && typeof data.id === 'string') return { type: 'vound:scrollTo', id: data.id }
  if (data.type === 'vound:focus' && (typeof data.id === 'string' || data.id === null)) return { type: 'vound:focus', id: data.id }
  return null
}
