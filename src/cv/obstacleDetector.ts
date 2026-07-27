import { PROC_H, PROC_W } from './laneDetector'
import {
  emptyObstacleResult,
  type LaneDetectionResult,
  type LanePoint,
  type ObstacleResult,
} from './types'

const MOTION_THRESHOLD = 28
const ANOMALY_SIGMA = 1.6
const MIN_BLOB_PIXELS = 40
const PREV_BLEND = 0.35

let prevGray: Float32Array | null = null
let grayBuf: Float32Array | null = null
let maskBuf: Uint8Array | null = null
let obstacleMap: Uint8Array | null = null
let visitedBuf: Uint8Array | null = null

function ensureBuffers(size: number) {
  if (!grayBuf || grayBuf.length !== size) grayBuf = new Float32Array(size)
  if (!maskBuf || maskBuf.length !== size) maskBuf = new Uint8Array(size)
  if (!obstacleMap || obstacleMap.length !== size)
    obstacleMap = new Uint8Array(size)
  if (!visitedBuf || visitedBuf.length !== size)
    visitedBuf = new Uint8Array(size)
  if (!prevGray || prevGray.length !== size) prevGray = new Float32Array(size)
}

function toGrayscale(data: Uint8ClampedArray, out: Float32Array, size: number) {
  for (let i = 0; i < size; i++) {
    const p = i * 4
    out[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114
  }
}

function interpolateX(line: LanePoint[], y: number): number | null {
  if (line.length === 0) return null
  if (line.length === 1) return line[0].x

  const sorted = [...line].sort((a, b) => a.y - b.y)
  if (y <= sorted[0].y) return sorted[0].x
  if (y >= sorted[sorted.length - 1].y) return sorted[sorted.length - 1].x

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / Math.max(1e-6, b.y - a.y)
      return a.x + (b.x - a.x) * t
    }
  }
  return sorted[sorted.length - 1].x
}

function buildCorridorMask(
  lane: LaneDetectionResult,
  w: number,
  h: number,
  mask: Uint8Array,
): { corridor: LanePoint[]; corridorPixels: number } {
  mask.fill(0)
  const corridor: LanePoint[] = []
  let corridorPixels = 0

  if (lane.leftLine.length < 2 || lane.rightLine.length < 2) {
    return { corridor, corridorPixels }
  }

  const yMin = Math.min(
    ...lane.leftLine.map((p) => p.y),
    ...lane.rightLine.map((p) => p.y),
  )
  const yMax = Math.max(
    ...lane.leftLine.map((p) => p.y),
    ...lane.rightLine.map((p) => p.y),
  )

  const startY = Math.max(0, Math.floor(yMin * h))
  const endY = Math.min(h - 1, Math.ceil(yMax * h))

  for (let py = startY; py <= endY; py++) {
    const y = py / h
    const lx = interpolateX(lane.leftLine, y)
    const rx = interpolateX(lane.rightLine, y)
    if (lx === null || rx === null) continue

    const left = Math.max(0, Math.floor(Math.min(lx, rx) * w))
    const right = Math.min(w - 1, Math.ceil(Math.max(lx, rx) * w))
    for (let px = left; px <= right; px++) {
      mask[py * w + px] = 255
      corridorPixels++
    }
  }

  const topLeft = {
    x: interpolateX(lane.leftLine, yMin) ?? 0.4,
    y: yMin,
  }
  const topRight = {
    x: interpolateX(lane.rightLine, yMin) ?? 0.6,
    y: yMin,
  }
  const bottomRight = {
    x: interpolateX(lane.rightLine, yMax) ?? 0.6,
    y: yMax,
  }
  const bottomLeft = {
    x: interpolateX(lane.leftLine, yMax) ?? 0.4,
    y: yMax,
  }
  corridor.push(topLeft, topRight, bottomRight, bottomLeft)

  return { corridor, corridorPixels }
}

interface BlobStats {
  area: number
  sumX: number
  sumY: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function floodBlob(
  map: Uint8Array,
  visited: Uint8Array,
  w: number,
  h: number,
  startX: number,
  startY: number,
): BlobStats {
  const stack: number[] = [startY * w + startX]
  visited[startY * w + startX] = 1

  const stats: BlobStats = {
    area: 0,
    sumX: 0,
    sumY: 0,
    minX: startX,
    maxX: startX,
    minY: startY,
    maxY: startY,
  }

  while (stack.length > 0) {
    const idx = stack.pop()!
    const x = idx % w
    const y = (idx / w) | 0
    stats.area++
    stats.sumX += x
    stats.sumY += y
    stats.minX = Math.min(stats.minX, x)
    stats.maxX = Math.max(stats.maxX, x)
    stats.minY = Math.min(stats.minY, y)
    stats.maxY = Math.max(stats.maxY, y)

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const nidx = ny * w + nx
        if (visited[nidx] || map[nidx] === 0) continue
        visited[nidx] = 1
        stack.push(nidx)
      }
    }
  }

  return stats
}

function findLargestBlob(
  map: Uint8Array,
  visited: Uint8Array,
  w: number,
  h: number,
): BlobStats | null {
  visited.fill(0)
  let best: BlobStats | null = null

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (map[idx] === 0 || visited[idx]) continue
      const blob = floodBlob(map, visited, w, h, x, y)
      if (blob.area < MIN_BLOB_PIXELS) continue
      if (!best || blob.area > best.area) best = blob
    }
  }

  return best
}

export function detectObstacles(
  imageData: ImageData,
  lane: LaneDetectionResult,
): ObstacleResult {
  const w = imageData.width || PROC_W
  const h = imageData.height || PROC_H
  const size = w * h
  ensureBuffers(size)

  if (lane.confidence < 0.35 || lane.leftLine.length < 2) {
    return emptyObstacleResult()
  }

  const gray = grayBuf!
  const mask = maskBuf!
  const map = obstacleMap!
  const visited = visitedBuf!
  const prev = prevGray!

  toGrayscale(imageData.data, gray, size)

  const { corridor, corridorPixels } = buildCorridorMask(lane, w, h, mask)
  if (corridorPixels < 50) {
    prev.set(gray)
    return { ...emptyObstacleResult(), corridor }
  }

  let sum = 0
  let sumSq = 0
  let count = 0
  for (let i = 0; i < size; i++) {
    if (mask[i] === 0) continue
    const v = gray[i]
    sum += v
    sumSq += v * v
    count++
  }
  const mean = sum / count
  const variance = Math.max(1, sumSq / count - mean * mean)
  const std = Math.sqrt(variance)
  const anomalyThresh = Math.max(18, ANOMALY_SIGMA * std)

  const hasPrev = prev.some((v, i) => mask[i] > 0 && v > 0)

  map.fill(0)
  for (let i = 0; i < size; i++) {
    if (mask[i] === 0) continue
    const anomaly = Math.abs(gray[i] - mean) > anomalyThresh
    const motion =
      hasPrev && Math.abs(gray[i] - prev[i]) > MOTION_THRESHOLD
    if (anomaly || motion) map[i] = 255
  }

  for (let i = 0; i < size; i++) {
    if (mask[i] === 0) {
      prev[i] = gray[i]
    } else {
      prev[i] = prev[i] * (1 - PREV_BLEND) + gray[i] * PREV_BLEND
    }
  }

  const blob = findLargestBlob(map, visited, w, h)
  if (!blob) {
    return { ...emptyObstacleResult(), corridor }
  }

  const cx = blob.sumX / blob.area / w
  const cy = blob.sumY / blob.area / h
  const areaFrac = blob.area / corridorPixels
  // Near (bottom of frame) weighs more heavily
  const nearWeight = 0.35 + cy * 0.65
  const severity = Math.max(
    0,
    Math.min(1, areaFrac * 4.5 * nearWeight + (cy > 0.75 ? 0.15 : 0)),
  )

  return {
    present: severity > 0.12,
    severity,
    blobCenter: { x: cx, y: cy },
    blobAreaFrac: areaFrac,
    clearance: 1 - severity,
    blobBounds: {
      x: blob.minX / w,
      y: blob.minY / h,
      w: (blob.maxX - blob.minX + 1) / w,
      h: (blob.maxY - blob.minY + 1) / h,
    },
    corridor,
  }
}

export function resetObstacleDetector() {
  prevGray = null
}
