import type { LaneDetectionResult } from '../cv/types'
import { PROC_H, PROC_W } from '../cv/laneDetector'
import { HOOD_ZONE_START } from './constants'

const ROI_START = 0.35
const BAND_COUNT = 10
const MIN_LANE_FRAC = 0.06
const MAX_LANE_FRAC = 0.65

interface LineFit {
  slope: number
  intercept: number
  residual: number
}

interface LanePoint {
  x: number
  y: number
}

function fitLineXofY(points: LanePoint[]): LineFit | null {
  if (points.length < 2) return null

  let sumY = 0
  let sumX = 0
  let sumYY = 0
  let sumXY = 0
  const n = points.length

  for (const p of points) {
    sumY += p.y
    sumX += p.x
    sumYY += p.y * p.y
    sumXY += p.x * p.y
  }

  const denom = n * sumYY - sumY * sumY
  if (Math.abs(denom) < 1e-6) return null

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumX - slope * sumY) / n

  let residual = 0
  for (const p of points) {
    residual += Math.abs(p.x - (slope * p.y + intercept))
  }

  return { slope, intercept, residual: residual / n }
}

function xAtY(fit: LineFit, y: number): number {
  return fit.slope * y + fit.intercept
}

function downsampleMask(
  mask: Uint8Array,
  maskW: number,
  maskH: number,
  outW: number,
  outH: number,
): Uint8Array {
  const out = new Uint8Array(outW * outH)
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(maskH - 1, Math.floor((y / outH) * maskH))
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(maskW - 1, Math.floor((x / outW) * maskW))
      out[y * outW + x] = mask[sy * maskW + sx]
    }
  }
  return out
}

function findLanePairInRow(
  mask: Uint8Array,
  row: number,
  w: number,
): [number, number] | null {
  const hits: number[] = []
  for (let x = 2; x < w - 2; x++) {
    if (mask[row + x] > 0) hits.push(x)
  }
  if (hits.length < 2) return null

  let best: [number, number] | null = null
  let bestScore = -1

  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      const left = Math.min(hits[i], hits[j])
      const right = Math.max(hits[i], hits[j])
      const width = (right - left) / w
      if (width < MIN_LANE_FRAC || width > MAX_LANE_FRAC) continue

      const mid = (left + right) / 2
      const centerScore = 1 - Math.abs(mid - w / 2) / (w / 2)
      const widthScore = 1 - Math.abs(width - 0.25) / 0.25
      const score = centerScore * 0.7 + widthScore * 0.3

      if (score > bestScore) {
        bestScore = score
        best = [left, right]
      }
    }
  }

  return best
}

function emptyResult(outW: number, outH: number): LaneDetectionResult {
  return {
    centerOffset: 0,
    curvature: 0,
    confidence: 0,
    leftLine: [],
    rightLine: [],
    edgeMap: null,
    width: outW,
    height: outH,
  }
}

/**
 * Convert a lane segmentation mask into LaneDetectionResult for path overlay.
 */
export function pathFromLaneMask(
  mask: Uint8Array,
  maskW: number,
  maskH: number,
  outW = PROC_W,
  outH = PROC_H,
): LaneDetectionResult {
  const edgeMap = downsampleMask(mask, maskW, maskH, outW, outH)

  const roiY = Math.floor(outH * ROI_START)
  const hoodY = Math.floor(outH * HOOD_ZONE_START)
  const roiH = hoodY - roiY
  if (roiH <= 0) {
    return { ...emptyResult(outW, outH), edgeMap }
  }

  const left: LanePoint[] = []
  const right: LanePoint[] = []
  const strengths: number[] = []

  for (let b = 0; b < BAND_COUNT; b++) {
    const y = roiY + Math.floor(((b + 0.5) / BAND_COUNT) * roiH)
    const row = y * outW
    const pair = findLanePairInRow(edgeMap, row, outW)

    if (pair) {
      left.push({ x: pair[0] / outW, y: y / outH })
      right.push({ x: pair[1] / outW, y: y / outH })
      strengths.push(1)
    }
  }

  if (left.length < 3 || right.length < 3) {
    const coverage = edgeMap.reduce((s, v) => s + (v > 0 ? 1 : 0), 0) / edgeMap.length
    return {
      ...emptyResult(outW, outH),
      edgeMap,
      confidence: Math.min(0.3, coverage * 2),
    }
  }

  const leftFit = fitLineXofY(left)
  const rightFit = fitLineXofY(right)
  if (!leftFit || !rightFit) {
    return { ...emptyResult(outW, outH), edgeMap }
  }

  const bottomY = (hoodY - 2) / outH
  const topY = ROI_START + 0.05
  const leftBottom = xAtY(leftFit, bottomY)
  const rightBottom = xAtY(rightFit, bottomY)
  const leftTop = xAtY(leftFit, topY)
  const rightTop = xAtY(rightFit, topY)

  const laneBottom = rightBottom - leftBottom
  if (laneBottom < MIN_LANE_FRAC || laneBottom > MAX_LANE_FRAC) {
    return { ...emptyResult(outW, outH), edgeMap }
  }

  const centerBottom = (leftBottom + rightBottom) / 2
  const centerTop = (leftTop + rightTop) / 2
  const centerOffset = centerBottom - 0.5
  const curvature = centerTop - centerBottom

  const widthSamples = left.map((p, i) => right[i].x - p.x)
  const avgWidth =
    widthSamples.reduce((a, b) => a + b, 0) / widthSamples.length
  const widthVariance =
    widthSamples.reduce((a, wv) => a + (wv - avgWidth) ** 2, 0) /
    widthSamples.length

  const edgeStrength =
    strengths.reduce((a, b) => a + b, 0) / strengths.length
  const fitQuality = 1 - Math.min(1, (leftFit.residual + rightFit.residual) * 8)
  const widthStability = 1 - Math.min(1, widthVariance * 30)
  const coverage = Math.min(1, left.length / BAND_COUNT)
  const maskCoverage =
    edgeMap.reduce((s, v) => s + (v > 0 ? 1 : 0), 0) / edgeMap.length

  const confidence =
    edgeStrength * 0.2 +
    fitQuality * 0.3 +
    widthStability * 0.2 +
    coverage * 0.2 +
    Math.min(0.1, maskCoverage * 0.5)

  return {
    centerOffset,
    curvature,
    confidence: Math.max(0, Math.min(1, confidence)),
    leftLine: left,
    rightLine: right,
    edgeMap,
    width: outW,
    height: outH,
  }
}
