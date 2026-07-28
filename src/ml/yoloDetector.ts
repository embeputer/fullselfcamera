import * as ort from 'onnxruntime-web'
import {
  classNameForId,
  DETECTION_CONFIDENCE,
  HOOD_ZONE_START,
  isHazardClass,
  MODEL_INPUT_SIZE,
  MODEL_PATH,
  NMS_IOU_THRESHOLD,
} from './constants'
import {
  emptyDetectionResult,
  type Detection,
  type DetectionResult,
} from './types'

const ORT_VERSION = '1.27.0'

let session: ort.InferenceSession | null = null
let floatBuffer: Float32Array | null = null

function configureOrtWasm() {
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
  ort.env.wasm.numThreads = 1
  ort.env.wasm.simd = true
}

function ensureFloatBuffer(size: number): Float32Array {
  if (!floatBuffer || floatBuffer.length !== size) {
    floatBuffer = new Float32Array(size)
  }
  return floatBuffer
}

/** Letterbox ImageData into square MODEL_INPUT_SIZE tensor (CHW, 0–1) */
function preprocess(
  imageData: ImageData,
): { tensor: ort.Tensor; scale: number; padX: number; padY: number } {
  const srcW = imageData.width
  const srcH = imageData.height
  const size = MODEL_INPUT_SIZE
  const scale = Math.min(size / srcW, size / srcH)
  const newW = Math.round(srcW * scale)
  const newH = Math.round(srcH * scale)
  const padX = (size - newW) / 2
  const padY = (size - newH) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Failed to create preprocess canvas')

  ctx.fillStyle = '#727272'
  ctx.fillRect(0, 0, size, size)
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = srcW
  srcCanvas.height = srcH
  const srcCtx = srcCanvas.getContext('2d')!
  srcCtx.putImageData(imageData, 0, 0)
  ctx.drawImage(srcCanvas, 0, 0, srcW, srcH, padX, padY, newW, newH)

  const resized = ctx.getImageData(0, 0, size, size)
  const pixels = size * size
  const buf = ensureFloatBuffer(3 * pixels)

  for (let i = 0; i < pixels; i++) {
    const p = i * 4
    buf[i] = resized.data[p] / 255
    buf[pixels + i] = resized.data[p + 1] / 255
    buf[2 * pixels + i] = resized.data[p + 2] / 255
  }

  const tensor = new ort.Tensor('float32', buf, [1, 3, size, size])
  return { tensor, scale, padX, padY }
}

function iou(a: Detection, b: Detection): number {
  const ix1 = Math.max(a.x1, b.x1)
  const iy1 = Math.max(a.y1, b.y1)
  const ix2 = Math.min(a.x2, b.x2)
  const iy2 = Math.min(a.y2, b.y2)
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1)
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
  return inter / (areaA + areaB - inter + 1e-6)
}

function nms(boxes: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence)
  const kept: Detection[] = []

  for (const box of sorted) {
    let overlap = false
    for (const k of kept) {
      if (k.classId === box.classId && iou(box, k) > iouThreshold) {
        overlap = true
        break
      }
    }
    if (!overlap) kept.push(box)
  }
  return kept
}

function isInHoodZone(d: Detection): boolean {
  const cy = (d.y1 + d.y2) / 2
  return cy >= HOOD_ZONE_START
}

function postprocess(
  output: Float32Array,
  dims: readonly number[],
  srcW: number,
  srcH: number,
  scale: number,
  padX: number,
  padY: number,
): Detection[] {
  const numFeatures = dims[1]
  const numBoxes = dims[2]
  const numClasses = numFeatures - 4
  const raw: Detection[] = []

  for (let i = 0; i < numBoxes; i++) {
    let maxScore = 0
    let maxClass = 0
    for (let c = 0; c < numClasses; c++) {
      const score = output[(4 + c) * numBoxes + i]
      if (score > maxScore) {
        maxScore = score
        maxClass = c
      }
    }
    if (maxScore < DETECTION_CONFIDENCE) continue

    const cx = output[0 * numBoxes + i]
    const cy = output[1 * numBoxes + i]
    const bw = output[2 * numBoxes + i]
    const bh = output[3 * numBoxes + i]

    const x1 = (cx - bw / 2 - padX) / scale / srcW
    const y1 = (cy - bh / 2 - padY) / scale / srcH
    const x2 = (cx + bw / 2 - padX) / scale / srcW
    const y2 = (cy + bh / 2 - padY) / scale / srcH

    const detection: Detection = {
      x1: Math.max(0, Math.min(1, x1)),
      y1: Math.max(0, Math.min(1, y1)),
      x2: Math.max(0, Math.min(1, x2)),
      y2: Math.max(0, Math.min(1, y2)),
      classId: maxClass,
      className: classNameForId(maxClass),
      confidence: maxScore,
      isHazard: isHazardClass(maxClass),
    }

    if (!isInHoodZone(detection)) {
      raw.push(detection)
    }
  }

  return nms(raw, NMS_IOU_THRESHOLD)
}

export async function loadYoloModel(): Promise<void> {
  if (session) return
  configureOrtWasm()
  session = await ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ['wasm'],
  })
}

export function isYoloLoaded(): boolean {
  return session !== null
}

export async function detectObjects(
  imageData: ImageData,
): Promise<DetectionResult> {
  const srcW = imageData.width
  const srcH = imageData.height

  if (!session) {
    return emptyDetectionResult(srcW, srcH)
  }

  const t0 = performance.now()
  const { tensor, scale, padX, padY } = preprocess(imageData)

  const feeds: Record<string, ort.Tensor> = {}
  const inputName = session.inputNames[0]
  feeds[inputName] = tensor

  const results = await session.run(feeds)
  const outputName = session.outputNames[0]
  const output = results[outputName]
  const data = output.data as Float32Array
  const dims = output.dims

  const detections = postprocess(
    data,
    dims,
    srcW,
    srcH,
    scale,
    padX,
    padY,
  )

  const hazards = detections.filter((d) => d.isHazard)
  let topHazardSeverity = 0
  for (const d of hazards) {
    const area = (d.x2 - d.x1) * (d.y2 - d.y1)
    const cy = (d.y1 + d.y2) / 2
    const s = d.confidence * area * (0.35 + cy * 0.65)
    if (s > topHazardSeverity) topHazardSeverity = s
  }

  const inferenceMs = performance.now() - t0

  return {
    detections,
    hazardCount: hazards.length,
    topHazardSeverity: Math.min(1, topHazardSeverity * 8),
    inferenceMs,
    frameWidth: srcW,
    frameHeight: srcH,
  }
}

export function destroyYoloModel(): void {
  session = null
  floatBuffer = null
}
