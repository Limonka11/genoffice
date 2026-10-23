import { afterEach, describe, expect, it } from 'vitest'
import { faceKey } from '@genoffice/font-metrics/resolve'
import wordFaces from '@genoffice/font-metrics/word-faces.json'
import { prefetchFaces, resolveDeclaredFace, setFontMetricsProvider } from '../../apps/docs/src/renderer/font-resolve'
import { buildFontMetricsManifest } from '../fontMetricsManifest'
import { fontMetricsFor } from '../fontMetricsLookup'

const manifest = buildFontMetricsManifest()
const lineTotal = (m: { unitsPerEm: number; hheaAscender: number; hheaDescender: number; hheaLineGap: number }) =>
  (m.hheaAscender - m.hheaDescender + m.hheaLineGap) / m.unitsPerEm

/** what the renderer lays a declared name out with when the host answers from the manifest */
async function resolvedWithManifest(names: string[]) {
  setFontMetricsProvider(async (family) => fontMetricsFor(manifest, family))
  // answer every family a substitution chain can reach before resolving, as the open-time prefetch does
  await prefetchFaces([...names, ...Object.keys(wordFaces.faces), ...Object.keys(wordFaces.system)])
  return names.map((name) => resolveDeclaredFace(name))
}

/** what it lays the name out with when there is no installed index: the macOS snapshot */
function resolvedWithSnapshot(names: string[]) {
  setFontMetricsProvider(null)
  return names.map((name) => resolveDeclaredFace(name))
}

afterEach(() => setFontMetricsProvider(undefined))

describe('buildFontMetricsManifest', () => {
  it('lays out the families of German forms exactly as Word for Mac on a stock Mac', async () => {
    const names = ['Arial', 'Calibri', 'Times New Roman', 'Cambria', 'Verdana', 'Courier New', 'Georgia', 'Tahoma']
    const withManifest = await resolvedWithManifest(names)
    const withSnapshot = resolvedWithSnapshot(names)
    names.forEach((name, i) => {
      expect(withManifest[i]?.family, name).toBe(withSnapshot[i]?.family)
      expect(withManifest[i]?.lineFactor, name).toBe(withSnapshot[i]?.lineFactor)
    })
    expect(withManifest[names.indexOf('Times New Roman')]?.lineFactor).toBe(1.1499)
  })

  it('answers the macOS copies with the real FaceVerticalMetrics keys', () => {
    for (const family of ['Times New Roman', 'Courier New', 'Georgia'])
      expect(fontMetricsFor(manifest, family), family).toMatchObject({
        unitsPerEm: 10000,
        hheaAscender: expect.any(Number),
        hheaDescender: expect.any(Number),
        hheaLineGap: expect.any(Number),
        useTypoMetrics: false,
      })
    expect(lineTotal(manifest[faceKey('Times New Roman')])).toBeCloseTo(1.1499, 9)
  })

  it("leaves Word's private faces out, so Word's own face table answers them", () => {
    for (const family of ['Calibri', 'Cambria', 'Arial', 'Verdana'])
      expect(fontMetricsFor(manifest, family), family).toBeNull()
  })

  it('gives every snapshot value back exactly after the renderer divides by unitsPerEm', () => {
    const system = Object.entries(wordFaces.system)
    expect(Object.keys(manifest)).toHaveLength(system.length)
    for (const [key, face] of system) {
      const m = manifest[key]
      expect(lineTotal(m), key).toBeCloseTo(face.hheaTotal, 9)
      expect(m.hheaAscender / m.unitsPerEm, key).toBeCloseTo(face.ascent, 9)
      expect(-m.hheaDescender / m.unitsPerEm, key).toBeCloseTo(face.descent, 9)
      expect(m.xAvgCharWidth === null ? null : m.xAvgCharWidth / m.unitsPerEm, key).toBe(face.xAvg)
      expect(((m.codePageRange1 ?? 0) & 0x3e0000) !== 0, key).toBe(face.eastAsian)
    }
  })
})
