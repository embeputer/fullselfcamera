import type { LaneDetectionResult, LanePoint } from './types'

const PROC_W = 320
const PROC_H = 180
const ROI_START = 0.35
const BAND_COUNT = 10
const MIN_LANE_FRAC = 0.06
const MAX_LANE_FRAC = 0.65

let grayBuf: Float32Array | null = null
let edgeBuf: Uint8Array | null = null
let scaleCanvas: HTMLCanvasElement | null = null
let scaleCtx: CanvasRenderingContext2D | null = null

function ensureBuffers(size: number) {
  if (!grayBuf || grayBuf.length !== size) grayBuf = new Float32Array(size)
  if (!edgeBuf || edgeBuf.length !== size) edgeBuf = new Uint8Array(size)
}

function getScaleCtx(): CanvasRenderingContext2D | null {
  if (!scaleCanvas) {
    scaleCanvas = document.createElement('canvas')
    scaleCanvas.width = PROC_W
    scaleCanvas.height = PROC_H
    scaleCtx = scaleCanvas.getContext('2d', { willReadFrequently: true })
  }
  return scaleCtx
}

function toGrayscale(data: Uint8ClampedArray, out: Float32Array, w: number, h: number) {
  for (let i = 0; i < w * h; i++) {
    const p = i * 4
    out[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114
  }
}

function boxBlur(src: Float32Array, w: number, h: number) {
  const tmp = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            sum += src[ny * w + nx]
            count++
          }
        }
      }
      tmp[y * w + x] = sum / count
    }
  }
  src.set(tmp)
}

function sobelEdges(gray: Float32Array, out: Uint8Array, w: number, h: number) {
  let maxMag = 1
  const mag = new Float32Array(w * h)

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      const gx =
        -gray[idx - w - 1] +
        gray[idx - w + 1] +
        -2 * gray[idx - 1] +
        2 * gray[idx + 1] +
        -gray[idx + w - 1] +
        gray[idx + w + 1]
      const gy =
        -gray[idx - w - 1] -
        2 * gray[idx - w] -
        gray[idx - w + 1] +
        gray[idx + w - 1] +
        2 * gray[idx + w] +
        gray[idx + w + 1]
      const m = Math.hypot(gx, gy)
      mag[idx] = m
      if (m > maxMag) maxMag = m
    }
  }

  const threshold = maxMag * 0.18
  for (let i = 0; i < w * h; i++) {
    out[i] = mag[i] >= threshold ? 255 : 0
  }
}

function roiMean(gray: Float32Array, w: number, h: number): number {
  const roiY = Math.floor(h * ROI_START)
  let sum = 0
  let count = 0
  for (let y = roiY; y < h; y++) {
    for (let x = 0; x < w; x++) {
      sum += gray[y * w + x]
      count++
    }
  }
  return count > 0 ? sum / count : 128
}

function markDarkPixels(
  gray: Float32Array,
  combined: Uint8Array,
  w: number,
  h: number,
  darkTh: number,
) {
  const roiY = Math.floor(h * ROI_START)
  for (let y = roiY; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (gray[idx] < darkTh) combined[idx] = 255
    }
  }
}

function clusterPositions(xs: number[], gap: number): number[] {
  if (xs.length === 0) return []
  const sorted = [...xs].sort((a, b) => a - b)
  const clusters: number[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1]
    if (sorted[i] - last[last.length - 1] <= gap) {
      last.push(sorted[i])
    } else {
      clusters.push([sorted[i]])
    }
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length)
}

interface LineFit {
  slope: number
  intercept: number
  residual: number
}

/** Fit x = slope * y + intercept (lanes are mostly vertical in image space). */
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

function findLanePairInRow(
  combined: Uint8Array,
  row: number,
  w: number,
): [number, number] | null {
  const hits: number[] = []
  for (let x = 2; x < w - 2; x++) {
    if (combined[row + x] > 0) hits.push(x)
  }
  if (hits.length < 2) return null

  const centers = clusterPositions(hits, 8)
  if (centers.length < 2) return null

  let best: [number, number] | null = null
  let bestScore = -1

  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const left = Math.min(centers[i], centers[j])
      const right = Math.max(centers[i], centers[j])
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

function scanBands(
  gray: Float32Array,
  edges: Uint8Array,
  w: number,
  h: number,
): {
  left: LanePoint[]
  right: LanePoint[]
  strengths: number[]
  combined: Uint8Array
} {
  const roiY = Math.floor(h * ROI_START)
  const roiH = h - roiY
  const left: LanePoint[] = []
  const right: LanePoint[] = []
  const strengths: number[] = []

  const mean = roiMean(gray, w, h)
  const darkTh = mean * 0.82

  const combined = new Uint8Array(w * h)
  combined.set(edges)
  markDarkPixels(gray, combined, w, h, darkTh)

  for (let b = 0; b < BAND_COUNT; b++) {
    const y = roiY + Math.floor(((b + 0.5) / BAND_COUNT) * roiH)
    const row = y * w
    const pair = findLanePairInRow(combined, row, w)

    if (pair) {
      left.push({ x: pair[0] / w, y: y / h })
      right.push({ x: pair[1] / w, y: y / h })
      strengths.push(1)
    }
  }

  return { left, right, strengths, combined }
}

function emptyResult(): LaneDetectionResult {
  return {
    centerOffset: 0,
    curvature: 0,
    confidence: 0,
    leftLine: [],
    rightLine: [],
    edgeMap: null,
    width: PROC_W,
    height: PROC_H,
  }
}

function processImageData(scaled: ImageData): LaneDetectionResult {
  const w = PROC_W
  const h = PROC_H
  const size = w * h
  ensureBuffers(size)

  const gray = grayBuf!
  const edges = edgeBuf!

  toGrayscale(scaled.data, gray, w, h)
  boxBlur(gray, w, h)
  sobelEdges(gray, edges, w, h)

  const { left, right, strengths, combined } = scanBands(gray, edges, w, h)

  if (left.length < 3 || right.length < 3) {
    return { ...emptyResult(), edgeMap: combined.slice(), width: w, height: h }
  }

  const leftFit = fitLineXofY(left)
  const rightFit = fitLineXofY(right)
  if (!leftFit || !rightFit) {
    return { ...emptyResult(), edgeMap: combined.slice(), width: w, height: h }
  }

  const bottomY = 0.95
  const topY = ROI_START + 0.05
  const leftBottom = xAtY(leftFit, bottomY)
  const rightBottom = xAtY(rightFit, bottomY)
  const leftTop = xAtY(leftFit, topY)
  const rightTop = xAtY(rightFit, topY)

  const laneBottom = rightBottom - leftBottom
  if (laneBottom < MIN_LANE_FRAC || laneBottom > MAX_LANE_FRAC) {
    return { ...emptyResult(), edgeMap: combined.slice(), width: w, height: h }
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

  const confidence =
    edgeStrength * 0.25 +
    fitQuality * 0.3 +
    widthStability * 0.25 +
    coverage * 0.2

  return {
    centerOffset,
    curvature,
    confidence: Math.max(0, Math.min(1, confidence)),
    leftLine: left,
    rightLine: right,
    edgeMap: combined.slice(),
    width: w,
    height: h,
  }
}

export function detectLanes(imageData: ImageData): LaneDetectionResult {
  if (imageData.width === PROC_W && imageData.height === PROC_H) {
    return processImageData(imageData)
  }

  const ctx = getScaleCtx()
  if (!ctx) return emptyResult()

  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = imageData.width
  srcCanvas.height = imageData.height
  srcCanvas.getContext('2d')!.putImageData(imageData, 0, 0)
  ctx.drawImage(srcCanvas, 0, 0, PROC_W, PROC_H)
  return processImageData(ctx.getImageData(0, 0, PROC_W, PROC_H))
}

export function detectLanesFromVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): LaneDetectionResult {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || video.videoWidth === 0) return emptyResult()

  canvas.width = PROC_W
  canvas.height = PROC_H
  ctx.drawImage(video, 0, 0, PROC_W, PROC_H)
  return processImageData(ctx.getImageData(0, 0, PROC_W, PROC_H))
}

export { PROC_W, PROC_H }
