import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import type { SlotMarker } from '../embed-protocol'
import { markersKey, markersPlugin } from '../markersPlugin'
import { doc, para, paragraphs, schema } from './markerSchema'

const marker = (id: string, paragraph: number): SlotMarker => ({ id, paragraph, scope: 'paragraph', tone: 'proposed' })
const stateWith = (...blocks: Parameters<typeof doc>) => EditorState.create({ schema, doc: doc(...blocks), plugins: [markersPlugin] })
/** the initial content the editor mounts with before a document is opened */
const initialState = () => stateWith(para(null))
const apply = (state: EditorState, edit: (tr: Transaction) => Transaction) => state.apply(edit(state.tr))
const withMeta = (state: EditorState, meta: object) => apply(state, (tr) => tr.setMeta(markersKey, meta))
const decorated = (state: EditorState) =>
  markersKey.getState(state)!.set.find().map((d) => ({ id: d.spec.slotId, from: d.from, to: d.to }))
const replaceDocument = (state: EditorState, blocks: ReturnType<typeof para>[]) =>
  apply(state, (tr) => tr.replaceWith(0, tr.doc.content.size, blocks))

let info: ReturnType<typeof vi.spyOn>
beforeEach(() => { info = vi.spyOn(console, 'info').mockImplementation(() => {}) })
afterEach(() => info.mockRestore())

describe('markersPlugin', () => {
  it('applies markers that arrived before the document and after phased appends', () => {
    let state = withMeta(initialState(), { markers: [marker('s0', 0), marker('s10', 10), marker('s190', 190)] })
    expect(decorated(state)).toEqual([])

    // phase 1: the first 64 blocks replace the initial paragraph
    state = replaceDocument(state, paragraphs(0, 64))
    expect(decorated(state).map((d) => d.id)).toEqual(['s0', 's10'])

    // the tail lands in one append
    state = apply(state, (tr) => tr.insert(tr.doc.content.size, paragraphs(64, 200)))
    expect(state.doc.childCount).toBe(200)
    const late = decorated(state).find((d) => d.id === 's190')
    expect(late).toBeDefined()
    expect(state.doc.nodeAt(late!.from)?.attrs.docxPara).toBe(190)
  })

  it('maps decorations through a text edit and drops the marker of a split paragraph', () => {
    let state = withMeta(stateWith(...paragraphs(0, 6)), { markers: [marker('s4', 4)] })
    const [before] = decorated(state)
    expect(state.doc.nodeAt(before.from)?.attrs.docxPara).toBe(4)

    // typing in the first paragraph moves the decoration
    state = apply(state, (tr) => tr.insertText('xx', 1))
    expect(decorated(state)).toEqual([{ id: 's4', from: before.from + 2, to: before.to + 2 }])

    // a split copies docxPara 4 to both halves: the index now names two nodes, so the marker goes
    state = apply(state, (tr) => tr.split(decorated(state)[0].from + 4))
    expect(state.doc.childCount).toBe(7)
    expect(decorated(state)).toEqual([])
    expect(info).toHaveBeenCalledWith('[vound] markers dropped', ['s4'])
  })

  it('survives an attribute change and a one-block replacement', () => {
    let state = withMeta(stateWith(...paragraphs(0, 3)), { markers: [marker('s1', 1)] })
    const [before] = decorated(state)
    state = apply(state, (tr) => tr.setNodeMarkup(before.from, undefined, { docxPara: 1, align: 'center' }))
    expect(state.doc.nodeAt(before.from)?.attrs.align).toBe('center')
    expect(decorated(state)).toEqual([before])

    // markers pending on the initial one-paragraph content, then a one-paragraph document opens
    let single = withMeta(initialState(), { markers: [marker('s0', 0)] })
    expect(decorated(single)).toEqual([])
    single = replaceDocument(single, [para(0, 'only paragraph')])
    expect(decorated(single)).toEqual([{ id: 's0', from: 0, to: single.doc.child(0).nodeSize }])
  })

  it('does not walk the document per edit once its markers were placed and then all dropped', () => {
    let state = withMeta(stateWith(...paragraphs(0, 3)), { markers: [marker('s1', 1)] })
    state = apply(state, (tr) => tr.delete(decorated(state)[0].from, decorated(state)[0].to))
    expect(decorated(state)).toEqual([])
    info.mockClear()
    state = apply(state, (tr) => tr.insertText('typed', 1))
    expect(info).not.toHaveBeenCalled()
    expect(decorated(state)).toEqual([])
  })

  it('sealed: markers and current metas are ignored until unseal', () => {
    let state = withMeta(stateWith(...paragraphs(0, 3)), { markers: [marker('s0', 0), marker('s2', 2)] })
    state = withMeta(state, { current: 's2' })
    expect(markersKey.getState(state)!.current).toBe('s2')

    state = withMeta(state, { sealed: true })
    expect(markersKey.getState(state)).toMatchObject({ markers: [], current: null, sealed: true })
    expect(decorated(state)).toEqual([])

    state = withMeta(state, { markers: [marker('s1', 1)] })
    state = withMeta(state, { current: 's1' })
    state = apply(state, (tr) => tr.insertText('edit', 1))
    expect(markersKey.getState(state)).toMatchObject({ markers: [], current: null, sealed: true })
    expect(decorated(state)).toEqual([])

    state = withMeta(state, { unseal: true })
    expect(markersKey.getState(state)!.sealed).toBe(false)
    state = withMeta(state, { markers: [marker('s1', 1)] })
    expect(decorated(state).map((d) => d.id)).toEqual(['s1'])
  })
})
