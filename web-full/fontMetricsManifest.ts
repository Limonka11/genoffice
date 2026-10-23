/**
 * The font metrics the browser host answers window.desktop.fontMetrics with, written to
 * dist/font-metrics.json at build time.
 *
 * Source: the macOS snapshot in word-faces.json (`system`), the same data the renderer's resolver
 * already uses as the stand-in for the installed-font index when no index is present. A browser has
 * no installed-font index of its own, and the build machine's fonts are not the reader's, so the
 * host answers as a stock Mac with Word would. Families that are not on a stock Mac (Calibri,
 * Cambria, Aptos: Word's private copies) are absent on purpose; for them the resolver uses Word's
 * own face table (`faces`), exactly as the desktop app does on a Mac.
 *
 * The snapshot stores ratios to the em (4 decimals). Each is encoded as FaceVerticalMetrics over a
 * 10000-unit em, so the renderer's division by unitsPerEm gives the snapshot values back exactly.
 */
import type { FaceVerticalMetrics } from '../packages/font-metrics/src/index'
import wordFaces from '../packages/font-metrics/word-faces.json'

const UNITS_PER_EM = 10000
/** OS/2 ulCodePageRange1 bit 17 (JIS), one of the East Asian bits the renderer tests */
const EAST_ASIAN_CODE_PAGE = 1 << 17

const units = (ratio: number) => Math.round(ratio * UNITS_PER_EM)

function encode(face: { hheaTotal: number; ascent: number; descent: number; xAvg: number | null; eastAsian: boolean }): FaceVerticalMetrics {
  const ascender = units(face.ascent)
  const descender = units(face.descent)
  return {
    unitsPerEm: UNITS_PER_EM,
    hheaAscender: ascender,
    hheaDescender: -descender,
    hheaLineGap: units(face.hheaTotal) - ascender - descender,
    typoAscender: null,
    typoDescender: null,
    typoLineGap: null,
    winAscent: null,
    winDescent: null,
    useTypoMetrics: false,
    xAvgCharWidth: face.xAvg === null ? null : units(face.xAvg),
    codePageRange1: face.eastAsian ? EAST_ASIAN_CODE_PAGE : 0,
  }
}

/** Keyed by the resolver's faceKey (lower case), which is the name the renderer asks for. */
export function buildFontMetricsManifest(): Record<string, FaceVerticalMetrics> {
  return Object.fromEntries(Object.entries(wordFaces.system).map(([key, face]) => [key, encode(face)]))
}
