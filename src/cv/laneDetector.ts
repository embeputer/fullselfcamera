import type { LaneDetectionResult, LanePoint } from './types'

const PROC_W = 320
const PROC_H = 180
const ROI_START = 0.45
const BAND_COUNT = 8
const MIN_LANE_FRAC = 0.08
const MAX_LANE_FRAC = 0.75

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

  const threshold = maxMag * 0.35
  for (let i = 0; i < w * h; i++) {
    out[i] = mag[i] >= threshold ? 255 : 0
  }
}

interface LineFit {
  slope: number
  intercept: number
  residual: number
}

function fitLine(points: LanePoint[]): LineFit | null {
  if (points.length < 2) return null

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  const n = points.length

  for (const p of points) {
    sumX += p.x
    sumY += p.y
    sumXY += p.x * p.y
    sumXX += p.x * p.x
  }

  const denom = n * sumXX - sumX * sumX
  if (Math.abs(denom) < 1e-6) return null

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  let residual = 0
  for (const p of points) {
    residual += Math.abs(p.y - (slope * p.x + intercept))
  }

  return { slope, intercept, residual: residual / n }
}

function scanBands(
  edges: Uint8Array,
  w: number,
  h: number,
): { left: LanePoint[]; right: LanePoint[]; strengths: number[] } {
  const roiY = Math.floor(h * ROI_START)
  const roiH = h - roiY
  const left: LanePoint[] = []
  const right: LanePoint[] = []
  const strengths: number[] = []

  for (let b = 0; b < BAND_COUNT; b++) {
    const y = roiY + Math.floor(((b + 0.5) / BAND_COUNT) * roiH)
    const row = y * w
    const center = Math.floor(w * 0.5)
    const searchMargin = Math.floor(w * 0.08)

    let leftX = -1
    let rightX = -1

    for (let x = searchMargin; x < center - 4; x++) {
      if (edges[row + x] > 0) {
        leftX = x
        break
      }
    }

    for (let x = w - searchMargin - 1; x > center + 4; x--) {
      if (edges[row + x] > 0) {
        rightX = x
        break
      }
    }

    if (leftX >= 0 && rightX >= 0 && rightX > leftX) {
      left.push({ x: leftX / w, y: y / h })
      right.push({ x: rightX / w, y: y / h })
      strengths.push(1)
    }
  }

  return { left, right, strengths }
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

  const { left, right, strengths } = scanBands(edges, w, h)

  if (left.length < 3 || right.length < 3) {
    return { ...emptyResult(), edgeMap: edges.slice(), width: w, height: h }
  }

  const leftFit = fitLine(left)
  const rightFit = fitLine(right)
  if (!leftFit || !rightFit) {
    return { ...emptyResult(), edgeMap: edges.slice(), width: w, height: h }
  }

  const bottomY = 0.95
  const topY = ROI_START + 0.05
  const leftBottom = (bottomY - leftFit.intercept) / leftFit.slope
  const rightBottom = (bottomY - rightFit.intercept) / rightFit.slope
  const leftTop = (topY - leftFit.intercept) / leftFit.slope
  const rightTop = (topY - rightFit.intercept) / rightFit.slope

  const laneBottom = rightBottom - leftBottom
  if (laneBottom < MIN_LANE_FRAC || laneBottom > MAX_LANE_FRAC) {
    return { ...emptyResult(), edgeMap: edges.slice(), width: w, height: h }
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
  const fitQuality = 1 - Math.min(1, (leftFit.residual + rightFit.residual) * 4)
  const widthStability = 1 - Math.min(1, widthVariance * 40)
  const coverage = Math.min(1, left.length / BAND_COUNT)

  const confidence =
    edgeStrength * 0.3 +
    fitQuality * 0.3 +
    widthStability * 0.25 +
    coverage * 0.15

  return {
    centerOffset,
    curvature,
    confidence: Math.max(0, Math.min(1, confidence)),
    leftLine: left,
    rightLine: right,
    edgeMap: edges.slice(),
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
