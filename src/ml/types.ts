export interface Detection {
  /** Normalized [0,1] bounding box */
  x1: number
  y1: number
  x2: number
  y2: number
  classId: number
  className: string
  confidence: number
  isHazard: boolean
  /** Large in-path blob in lower frame — triggers even without a hazard COCO class */
  isProximityHazard: boolean
}

export type InferenceStatus =
  | 'idle'
  | 'loading'
  | 'running'
  | 'ok'
  | 'error'

export interface DetectionResult {
  detections: Detection[]
  hazardCount: number
  topHazardSeverity: number
  inferenceMs: number
  frameWidth: number
  frameHeight: number
  inferenceStatus: InferenceStatus
  inferenceError: string | null
  totalInferences: number
}

export interface YoloRuntimeStatus {
  loadState: InferenceStatus
  loadError: string | null
  inferState: InferenceStatus
  inferError: string | null
  totalInferences: number
}

export interface LaneSegResult {
  /** Binary lane mask at maskWidth × maskHeight */
  mask: Uint8Array
  maskWidth: number
  maskHeight: number
  confidence: number
  inferenceMs: number
  frameWidth: number
  frameHeight: number
  inferenceStatus: InferenceStatus
  inferenceError: string | null
  totalInferences: number
}

export interface LaneSegRuntimeStatus {
  loadState: InferenceStatus
  loadError: string | null
  inferState: InferenceStatus
  inferError: string | null
  totalInferences: number
}

export function emptyLaneSegResult(
  frameWidth = 0,
  frameHeight = 0,
  status: InferenceStatus = 'idle',
  error: string | null = null,
): LaneSegResult {
  return {
    mask: new Uint8Array(0),
    maskWidth: 0,
    maskHeight: 0,
    confidence: 0,
    inferenceMs: 0,
    frameWidth,
    frameHeight,
    inferenceStatus: status,
    inferenceError: error,
    totalInferences: 0,
  }
}

/** Obstacle signal derived from ML detections — LaneStatusHUD compatible */
export interface MLObstacleStatus {
  present: boolean
  severity: number
  topDetection: Detection | null
}

export function emptyDetectionResult(
  frameWidth = 0,
  frameHeight = 0,
  status: InferenceStatus = 'idle',
  error: string | null = null,
): DetectionResult {
  return {
    detections: [],
    hazardCount: 0,
    topHazardSeverity: 0,
    inferenceMs: 0,
    frameWidth,
    frameHeight,
    inferenceStatus: status,
    inferenceError: error,
    totalInferences: 0,
  }
}

export function emptyMLObstacleStatus(): MLObstacleStatus {
  return { present: false, severity: 0, topDetection: null }
}
