// The plain text a review-mode paste inserts: the clipboard's text/plain, or the text of its HTML with one
// line per block. Line breaks become line feeds inside the one paragraph the paste lands in.

const blockElements = new Set(['ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL'])

/** The text of an HTML fragment: whitespace collapsed as a browser shows it, a line feed for every <br>
 *  and between blocks, none leading or trailing. */
export function htmlText(html: string): string {
  const parts: string[] = []
  const last = () => parts[parts.length - 1]
  // a block boundary ends the line once: the source's indentation between blocks adds nothing
  const lineEnd = () => {
    while (parts.length > 0 && last() !== '\n' && last().trim() === '') parts.pop()
    if (parts.length > 0 && last() !== '\n') parts.push('\n')
  }
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push((node.textContent ?? '').replace(/\s+/g, ' '))
      return
    }
    if (node.nodeName === 'BR') { parts.push('\n'); return }
    const block = blockElements.has(node.nodeName)
    if (block) lineEnd()
    node.childNodes.forEach(walk)
    if (block) lineEnd()
  }
  walk(new DOMParser().parseFromString(html, 'text/html').body)
  return parts.join('').replace(/ *\n */g, '\n').trim()
}

/** The clipboard's text, from text/plain or else from its HTML, with Windows line ends made line feeds. */
export function clipboardText(data: DataTransfer): string {
  const text = data.getData('text/plain') || htmlText(data.getData('text/html'))
  return text.replace(/\r\n?/g, '\n')
}
