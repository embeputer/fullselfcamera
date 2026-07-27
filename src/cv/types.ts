export interface LanePoint {
  x: number
  y: number
}

export interface LaneDetectionResult {
  centerOffset: number
  curvature: number
  confidence: number
  leftLine: LanePoint[]
  rightLine: LanePoint[]
  edgeMap: Uint8Array | null
  width: number
  height: number
}

export const CONFIDENCE_THRESHOLD = 0.35
