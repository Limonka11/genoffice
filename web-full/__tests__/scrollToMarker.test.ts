// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import type { SlotMarker } from '../embed-protocol'
import { markersKey, markersPlugin, scrollToMarker, setMarkers } from '../markersPlugin'
import { doc, paragraphs, schema } from './markerSchema'

const marker = (id: string, paragraph: number, tone: SlotMarker['tone']): SlotMarker => ({ id, paragraph, scope: 'paragraph', tone })

let view: EditorView | null = null
afterEach(() => view?.destroy())

describe('scrollToMarker', () => {
  it('finds a paragraph shared by two slots by its second id, scrolls it and makes that id current', () => {
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ schema, doc: doc(...paragraphs(0, 3)), plugins: [markersPlugin] }),
    })
    setMarkers(view, [marker('ort', 1, 'accepted'), marker('datum', 1, 'gap')])

    expect(scrollToMarker(view, 'datum')).toBe(true)
    expect(markersKey.getState(view.state)!.current).toBe('datum')
    const marked = view.dom.querySelector('[data-vound-slot~="datum"]')
    expect(marked?.getAttribute('data-vound-slot')).toBe('ort datum')
    expect(marked?.className).toContain('vound-slot-current')
    expect(scrolled).toHaveBeenCalledWith({ block: 'center' })
    expect(scrolled.mock.contexts[0]).toBe(marked)

    expect(scrollToMarker(view, 'missing')).toBe(false)
  })
})
