import type { FaceVerticalMetrics } from '../packages/font-metrics/src/index'
import { faceKey } from '../packages/font-metrics/src/resolve'

export type FontMetricsManifest = Record<string, FaceVerticalMetrics>

/** The manifest's answer for a family, null when a stock Mac does not have it installed. */
export const fontMetricsFor = (manifest: FontMetricsManifest, family: string): FaceVerticalMetrics | null =>
  manifest[faceKey(family)] ?? null

export const isFontMetricsManifest = (value: unknown): value is FontMetricsManifest =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
