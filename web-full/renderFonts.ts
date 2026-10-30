const unquote = (family: string) => family.replace(/^["']|["']$/g, '')
type FaceDescriptors = Pick<FontFace, 'family' | 'unicodeRange' | 'weight' | 'style'>
const faceKey = ({ family, unicodeRange, weight, style }: FaceDescriptors) =>
  [unquote(family), unicodeRange, weight, style].join('|')

/** @font-face rules that download a file; local()-only faces are the editor's fallback chain and may be absent. */
function downloadedFaceKeys(): Set<string> {
  const keys = new Set<string>()
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (
        !(rule instanceof CSSFontFaceRule) ||
        !rule.style.getPropertyValue('src').includes('url(')
      )
        continue
      const read = (property: string, initial: string) =>
        rule.style.getPropertyValue(property) || initial
      keys.add(
        faceKey({
          family: read('font-family', ''),
          unicodeRange: read('unicode-range', 'U+0-10FFFF'),
          weight: read('font-weight', 'normal'),
          style: read('font-style', 'normal'),
        }),
      )
    }
  }
  return keys
}

/** Families of downloaded faces whose load failed. */
export function failedDownloadedFonts(): string[] {
  const downloaded = downloadedFaceKeys()
  const failed = [...document.fonts].filter(
    (face) => face.status === 'error' && downloaded.has(faceKey(face)),
  )
  return [...new Set(failed.map((face) => unquote(face.family)))]
}
