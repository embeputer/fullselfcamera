import * as ort from 'onnxruntime-web/webgpu'

export type OrtExecutionProvider = 'webgpu' | 'wasm'

export { ort }

let activeProvider: OrtExecutionProvider | null = null
let webgpuProbed = false
let webgpuAvailable = false

const IS_DEV = import.meta.env.DEV

function logDev(...args: unknown[]) {
  if (IS_DEV) console.log('[ort]', ...args)
}

function forceWasmFromUrl(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('ep') === 'wasm'
}

/** Check if WebGPU adapter is available (desktop Chrome/Edge, recent Safari). */
export async function probeWebGpu(): Promise<boolean> {
  if (webgpuProbed) return webgpuAvailable
  webgpuProbed = true

  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    webgpuAvailable = false
    return false
  }

  try {
    const gpu = (
      navigator as Navigator & {
        gpu?: { requestAdapter(): Promise<GPUAdapter | null> }
      }
    ).gpu
    const adapter = await gpu?.requestAdapter()
    webgpuAvailable = adapter != null
    logDev('WebGPU adapter:', webgpuAvailable ? 'yes' : 'no')
    return webgpuAvailable
  } catch {
    webgpuAvailable = false
    return false
  }
}

export function getActiveExecutionProvider(): OrtExecutionProvider | null {
  return activeProvider
}

export function isWebGpuActive(): boolean {
  return activeProvider === 'webgpu'
}

export function configureOrtEnv(): void {
  ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`
  ort.env.wasm.numThreads = 1
  ort.env.wasm.simd = true
}

/**
 * Create an ONNX session. Tries WebGPU first on capable desktops, falls back to WASM.
 * Force WASM with ?ep=wasm (useful for debugging mobile-like perf on desktop).
 */
export async function createOrtSession(
  modelPath: string,
  label: string,
): Promise<ort.InferenceSession> {
  configureOrtEnv()

  const forceWasm = forceWasmFromUrl()
  const useWebGpu = !forceWasm && (await probeWebGpu())

  if (useWebGpu) {
    try {
      logDev(`[${label}] creating session with webgpu+wasm fallback`)
      const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['webgpu', 'wasm'],
      })
      activeProvider = 'webgpu'
      logDev(`[${label}] session ready (webgpu)`)
      return session
    } catch (err) {
      console.warn(`[ort] WebGPU failed for ${label}, falling back to WASM:`, err)
    }
  }

  logDev(`[${label}] creating session with wasm`)
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['wasm'],
  })
  activeProvider = 'wasm'
  logDev(`[${label}] session ready (wasm)`)
  return session
}

/** Faster inference intervals when WebGPU is active. */
export function getMlInferenceIntervalMs(): number {
  return isWebGpuActive() ? 100 : 150
}

export function getLaneInferenceIntervalMs(): number {
  return isWebGpuActive() ? 80 : 125
}
