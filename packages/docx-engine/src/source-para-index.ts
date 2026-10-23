/**
 * Source paragraph index: the position of a paragraph among all elements whose
 * local name is `p` in the original word/document.xml, in document order.
 * mc:Fallback subtrees (the legacy twin of an mc:Choice), comments and CDATA
 * sections do not count. A host names paragraphs by this index; it is read-only
 * and never written back into a saved file.
 */
import { opaqueEnd } from './scan'
import { childrenOf, nameOf, type XNode } from './xml-utils'

/** a tag's name runs to whitespace, "/" or ">": <w:pPr> or <w:pict> never reads as <w:p>;
 *  any name character counts, as in the XML parser the table walk reads */
const TAG_NAME_RE = /<(\/?)([^\s/>]+)/y
const FALLBACK = 'mc:Fallback'

const localNameOf = (name: string) => name.slice(name.lastIndexOf(':') + 1)

/** end of the tag opening at `start`; a ">" inside a quoted attribute value does not end it */
function tagEnd(xml: string, start: number): number {
  let quote = ''
  for (let index = start + 1; index < xml.length; index += 1) {
    const character = xml[index]
    if (quote) {
      if (character === quote) quote = ''
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return index + 1
    }
  }
  return xml.length
}

/**
 * Start offsets of every opening tag whose local name is `p` (any prefix), in
 * document order; tags inside <mc:Fallback>…</mc:Fallback>, <!-- --> and
 * <![CDATA[ ]]> are excluded; the name must end at whitespace, "/" or ">".
 */
export function paragraphStartOffsets(documentXml: string): number[] {
  const starts: number[] = []
  let fallbackDepth = 0
  let cursor = 0
  for (;;) {
    const start = documentXml.indexOf('<', cursor)
    if (start === -1) break
    const opaque = opaqueEnd(documentXml, start)
    if (opaque !== null) {
      cursor = opaque
      continue
    }
    const end = tagEnd(documentXml, start)
    cursor = end
    TAG_NAME_RE.lastIndex = start
    const match = TAG_NAME_RE.exec(documentXml)
    if (!match) continue
    const closing = match[1] === '/'
    const name = match[2]!
    if (name === FALLBACK) {
      if (closing) fallbackDepth = Math.max(0, fallbackDepth - 1)
      else if (documentXml[end - 2] !== '/') fallbackDepth += 1
      continue
    }
    if (!closing && fallbackDepth === 0 && localNameOf(name) === 'p') starts.push(start)
  }
  return starts
}

/** index of the paragraph that starts exactly at `offset`, or undefined */
export function paragraphIndexAt(starts: number[], offset: number): number | undefined {
  let low = 0
  let high = starts.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const start = starts[middle]!
    if (start === offset) return middle
    if (start < offset) low = middle + 1
    else high = middle - 1
  }
  return undefined
}

/** how many paragraphs start before `offset` */
export function paragraphsBefore(starts: number[], offset: number): number {
  let low = 0
  let high = starts.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (starts[middle]! < offset) low = middle + 1
    else high = middle
  }
  return low
}

/**
 * Every element with local name `p` under `root` (root included when it is
 * one) → `base` + its document-order position; mc:Fallback subtrees skipped.
 * Walks iteratively: table XML may nest thousands of levels deep.
 */
export function paragraphIndexMap(root: XNode, base: number): Map<XNode, number> {
  const ordinals = new Map<XNode, number>()
  const pending: XNode[] = [root]
  while (pending.length > 0) {
    const node = pending.pop()!
    const name = nameOf(node)
    if (name === undefined || name === FALLBACK) continue
    if (localNameOf(name) === 'p') ordinals.set(node, base + ordinals.size)
    const children = childrenOf(node)
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]!)
  }
  return ordinals
}
