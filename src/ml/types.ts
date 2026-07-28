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

export interface DetectionResult {
  detections: Detection[]
  hazardCount: number
  topHazardSeverity: number
  inferenceMs: number
  frameWidth: number
  frameHeight: number
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
): DetectionResult {
  return {
    detections: [],
    hazardCount: 0,
    topHazardSeverity: 0,
    inferenceMs: 0,
    frameWidth,
    frameHeight,
  }
}

export function emptyMLObstacleStatus(): MLObstacleStatus {
  return { present: false, severity: 0, topDetection: null }
}
