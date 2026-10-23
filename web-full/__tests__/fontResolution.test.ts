import { afterEach, expect, it } from 'vitest'
import { resolveDeclaredFace, setFontMetricsProvider } from '../../apps/docs/src/renderer/font-resolve'

// The production build has no font provider (shim.ts: fontMetrics is undefined outside dev), so the
// renderer lays out from its bundled data: the macOS snapshot (`system`) where Word for Mac uses the
// installed copy, Word's own face table (`faces`) otherwise. These are the answers the editor gives.
afterEach(() => setFontMetricsProvider(undefined))

it('lays out the families of German forms as Word for Mac does on a stock Mac', () => {
  setFontMetricsProvider(null)
  const answers = Object.fromEntries(
    ['Arial', 'Calibri', 'Times New Roman', 'Cambria', 'Verdana', 'Courier New', 'Georgia', 'Tahoma'].map((name) => {
      const face = resolveDeclaredFace(name)
      return [name, face && { family: face.family, source: face.source, lineFactor: face.lineFactor }]
    }),
  )
  expect(answers).toEqual({
    Arial: { family: 'Arial', source: 'dfonts', lineFactor: 1.1499 },
    Calibri: { family: 'Calibri', source: 'dfonts', lineFactor: 1.2207 },
    // the macOS copy (lineGap 87), not Word's own 1.1074
    'Times New Roman': { family: 'Times New Roman', source: 'system', lineFactor: 1.1499 },
    Cambria: { family: 'Cambria', source: 'dfonts', lineFactor: 1.1724 },
    Verdana: { family: 'Verdana', source: 'dfonts', lineFactor: 1.2153 },
    'Courier New': { family: 'Courier New', source: 'system', lineFactor: 1.1328 },
    Georgia: { family: 'Georgia', source: 'system', lineFactor: 1.1362 },
    Tahoma: { family: 'Tahoma', source: 'dfonts', lineFactor: 1.207 },
  })
})
