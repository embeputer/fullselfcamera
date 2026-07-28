import * as ort from 'onnxruntime-web'
import {
  LANE_INPUT_HEIGHT,
  LANE_INPUT_WIDTH,
  LANE_MODEL_PATH,
} from './constants'
import {
  emptyLaneSegResult,
  type InferenceStatus,
  type LaneSegResult,
  type LaneSegRuntimeStatus,
} from './types'

let session: ort.InferenceSession | null = null
let floatBuffer: Float32Array | null = null
let loadState: InferenceStatus = 'idle'
let loadError: string | null = null
let inferState: InferenceStatus = 'idle'
let inferError: string | null = null
let totalInferences = 0

const IS_DEV = import.meta.env.DEV

function logDev(...args: unknown[]) {
  if (IS_DEV) console.log('[lane]', ...args)
}

function configureOrtWasm() {
  ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`
  ort.env.wasm.numThreads = 1
  ort.env.wasm.simd = true
}

function ensureFloatBuffer(size: number): Float32Array {
  if (!floatBuffer || floatBuffer.length !== size) {
    floatBuffer = new Float32Array(size)
  }
  return floatBuffer
}

/** Resize frame to LANE_INPUT_WIDTH×LANE_INPUT_HEIGHT, RGB CHW 0–1 */
function preprocess(imageData: ImageData): ort.Tensor {
  const srcW = imageData.width
  const srcH = imageData.height
  const outW = LANE_INPUT_WIDTH
  const outH = LANE_INPUT_HEIGHT

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Failed to create lane preprocess canvas')

  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = srcW
  srcCanvas.height = srcH
  const srcCtx = srcCanvas.getContext('2d')!
  srcCtx.putImageData(imageData, 0, 0)
  ctx.drawImage(srcCanvas, 0, 0, srcW, srcH, 0, 0, outW, outH)

  const resized = ctx.getImageData(0, 0, outW, outH)
  const pixels = outW * outH
  const buf = ensureFloatBuffer(3 * pixels)

  for (let i = 0; i < pixels; i++) {
    const p = i * 4
    buf[i] = resized.data[p] / 255
    buf[pixels + i] = resized.data[p + 1] / 255
    buf[2 * pixels + i] = resized.data[p + 2] / 255
  }

  return new ort.Tensor('float32', buf, [1, 3, outH, outW])
}

/** Argmax on lane logits [1, 2, H, W] → binary mask */
function laneLogitsToMask(data: Float32Array, h: number, w: number): Uint8Array {
  const plane = h * w
  const mask = new Uint8Array(plane)
  for (let i = 0; i < plane; i++) {
    mask[i] = data[i + plane] > data[i] ? 255 : 0
  }
  return mask
}

function maskConfidence(mask: Uint8Array, h: number, w: number): number {
  const roiStart = Math.floor(h * 0.35)
  const hoodStart = Math.floor(h * 0.82)
  let lanePx = 0
  let total = 0
  for (let y = roiStart; y < hoodStart; y++) {
    for (let x = 0; x < w; x++) {
      total++
      if (mask[y * w + x] > 0) lanePx++
    }
  }
  if (total === 0) return 0
  const coverage = lanePx / total
  return Math.max(0, Math.min(1, coverage * 4))
}

export function getLaneSegRuntimeStatus(): LaneSegRuntimeStatus {
  return {
    loadState,
    loadError,
    inferState,
    inferError,
    totalInferences,
  }
}

export async function loadLaneSegModel(): Promise<void> {
  if (session) return
  if (loadState === 'loading') return

  loadState = 'loading'
  loadError = null
  configureOrtWasm()
  logDev(
    'loading model from',
    LANE_MODEL_PATH,
    'input',
    `${LANE_INPUT_WIDTH}×${LANE_INPUT_HEIGHT}`,
  )

  try {
    session = await ort.InferenceSession.create(LANE_MODEL_PATH, {
      executionProviders: ['wasm'],
    })
    loadState = 'ok'
    logDev('model ready', session.inputNames, session.outputNames)
  } catch (err) {
    loadState = 'error'
    loadError = err instanceof Error ? err.message : String(err)
    session = null
    console.error('[lane] model load failed:', loadError)
    throw err
  }
}

export function isLaneSegLoaded(): boolean {
  return session !== null
}

export async function detectLaneMask(
  imageData: ImageData,
): Promise<LaneSegResult> {
  const srcW = imageData.width
  const srcH = imageData.height

  if (!session) {
    return emptyLaneSegResult(
      srcW,
      srcH,
      loadState === 'error' ? 'error' : 'idle',
      loadError ?? 'Lane model not loaded',
    )
  }

  inferState = 'running'
  const t0 = performance.now()

  try {
    const tensor = preprocess(imageData)
    const inputName = session.inputNames[0]
    const results = await session.run({ [inputName]: tensor })

    const llName =
      session.outputNames.find((n) => n === 'll') ?? session.outputNames[1]
    const ll = results[llName]
    const data = ll.data as Float32Array
    const [, , h, w] = ll.dims

    const mask = laneLogitsToMask(data, h, w)
    const confidence = maskConfidence(mask, h, w)
    const inferenceMs = performance.now() - t0
    totalInferences += 1
    inferState = 'ok'
    inferError = null

    if (IS_DEV && totalInferences % 10 === 1) {
      logDev(
        `infer ok #${totalInferences}: conf ${(confidence * 100).toFixed(0)}%, ${inferenceMs.toFixed(0)}ms`,
      )
    }

    return {
      mask,
      maskWidth: w,
      maskHeight: h,
      confidence,
      inferenceMs,
      frameWidth: srcW,
      frameHeight: srcH,
      inferenceStatus: 'ok',
      inferenceError: null,
      totalInferences,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    inferState = 'error'
    inferError = message
    console.error('[lane] inference failed:', message)
    return emptyLaneSegResult(srcW, srcH, 'error', message)
  }
}

export function destroyLaneSegModel(): void {
  session = null
  floatBuffer = null
  loadState = 'idle'
  loadError = null
  inferState = 'idle'
  inferError = null
  totalInferences = 0
}
