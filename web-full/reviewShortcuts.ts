// The keyboard shortcuts review mode blocks: the editor keymaps' bold, italic and underline, and every
// formatting or document-tool shortcut App.tsx handles in its window keydown handler (which does not look
// at defaultPrevented). Undo, redo, clipboard, select-all, save, find, zoom, navigation and typing pass.
// Matching mirrors App.tsx: Mod is Command or Control on every platform; letters it reads from e.key,
// digits and punctuation from e.code.
export type ShortcutKeys = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>

/** `mod`: 'any' is Command or Control, 'ctrl' Control without Command, 'none' neither. An unset
 *  modifier may be either way. `key` is the lower-case letter, `code` the physical key. */
type Combo = { mod?: 'any' | 'ctrl' | 'none'; shift?: boolean; alt?: boolean; key?: string; code?: string }

const plainMod = { mod: 'any', shift: false, alt: false } as const
const letters = (...keys: string[]): Combo[] => keys.map((key) => ({ ...plainMod, key }))
const codes = (base: Combo, ...list: string[]): Combo[] => list.map((code) => ({ ...base, code }))

const combos = (mac: boolean): Combo[] => [
  // bold, italic, underline; alignment left, center, right, justify; font dialog, hyperlink
  ...letters('b', 'i', 'u', 'l', 'e', 'r', 'j', 'd', 'k'),
  // paragraph dialog ⌥⌘M
  { mod: 'any', alt: true, code: 'KeyM' },
  // line spacing ⌘1 / ⌘2 / ⌘5; one-point font nudge ⌘] / ⌘[
  ...codes(plainMod, 'Digit1', 'Digit2', 'Digit5', 'BracketRight', 'BracketLeft'),
  // paragraph styles ⌥⌘0 to ⌥⌘3
  ...codes({ mod: 'any', alt: true, shift: false }, 'Digit0', 'Digit1', 'Digit2', 'Digit3'),
  // font size ⇧⌘. / ⇧⌘, and superscript / subscript ⌘. / ⌘, / ⇧⌘=
  ...codes({ mod: 'any', alt: false }, 'Period', 'Comma'),
  { mod: 'any', alt: false, shift: true, code: 'Equal' },
  // hanging indent ⌘T / ⇧⌘T; track changes ⇧⌘E
  { mod: 'any', alt: false, code: 'KeyT' },
  { mod: 'any', alt: false, shift: true, code: 'KeyE' },
  // indent ⌃M / ⌃⇧M; clear character formatting ⌃Space; clear paragraph formatting ⌃Q
  { mod: 'ctrl', alt: false, code: 'KeyM' },
  ...codes({ mod: 'ctrl', alt: false, shift: false }, 'Space', 'KeyQ'),
  // new comment ⌥⌘A; footnote ⌥⌘F; endnote ⌥⌘E on the Mac, Ctrl+Alt+D elsewhere (Ctrl+Alt+E is AltGr+E there)
  ...codes({ mod: 'any', alt: true }, 'KeyA', 'KeyF', mac ? 'KeyE' : 'KeyD'),
  // date and time fields ⌥⇧D / ⌥⇧T
  ...codes({ mod: 'none', alt: true, shift: true }, 'KeyD', 'KeyT'),
  // change case ⇧F3; update fields F9 and field codes ⌥F9; AI proofread F7
  { shift: true, code: 'F3' },
  { code: 'F9' },
  { shift: false, code: 'F7' },
]

const holds = (expected: boolean | undefined, actual: boolean) => expected === undefined || expected === actual
const modHeld = { any: (e: ShortcutKeys) => e.metaKey || e.ctrlKey, ctrl: (e: ShortcutKeys) => e.ctrlKey && !e.metaKey, none: (e: ShortcutKeys) => !e.metaKey && !e.ctrlKey }

function matches(combo: Combo, event: ShortcutKeys) {
  if (combo.mod && !modHeld[combo.mod](event)) return false
  if (!holds(combo.shift, event.shiftKey) || !holds(combo.alt, event.altKey)) return false
  if (combo.key !== undefined && combo.key !== event.key.toLowerCase()) return false
  return combo.code === undefined || combo.code === event.code
}

export const isMacPlatform = () => typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform)

export function blockedInReview(event: ShortcutKeys, mac: boolean): boolean {
  return combos(mac).some((combo) => matches(combo, event))
}

/** On the Mac, Control+letter is the system's text navigation (⌃E end of line, ⌃D delete forward):
 *  the app and the editor must not see it, but the browser's own action stays. */
export function keepsNativeAction(event: ShortcutKeys, mac: boolean): boolean {
  return mac && event.ctrlKey && !event.metaKey
}
