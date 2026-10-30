// Review-mode keys for the field chip's accept and reject: Mod-Enter accepts and Mod-Shift-Backspace rejects
// the field the caret is in (Mod is Command on the Mac, Control elsewhere), posted as vound:fieldAction like
// a chip press. A key acts only when one field at the caret offers that action, or the host's current field
// is among those that do; otherwise it keeps its normal meaning (Mod-Enter is the editor's page break).
import { keydownHandler } from '@tiptap/pm/keymap'
import type { Command } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { EditorToHost, FieldAction } from './embed-protocol'
import { markersKey } from './markersPlugin'

/** the slot id the key acts on: the current field if it offers `action`, else the only field that does */
export function fieldForAction(view: EditorView, ids: string[], action: FieldAction): string | null {
  const markers = markersKey.getState(view.state)
  const offering = (markers?.markers ?? []).filter((marker) => ids.includes(marker.id) && marker.actions.includes(action))
  const current = offering.find((marker) => marker.id === markers?.current)
  if (current) return current.id
  return offering.length === 1 ? offering[0].id : null
}

/** the keydown handler posting accept and reject through `post` for the fields `caretIds` finds at the caret */
export function fieldActionKeys(post: (msg: EditorToHost) => void, caretIds: (view: EditorView) => string[]) {
  const act =
    (action: FieldAction): Command =>
    (_state, _dispatch, view) => {
      const id = view ? fieldForAction(view, caretIds(view), action) : null
      if (!id) return false
      post({ type: 'vound:fieldAction', id, action })
      return true
    }
  return keydownHandler({ 'Mod-Enter': act('accept'), 'Mod-Shift-Backspace': act('reject') })
}
