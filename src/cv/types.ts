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

export interface ObstacleResult {
  present: boolean
  severity: number
  blobCenter: { x: number; y: number } | null
  blobAreaFrac: number
  clearance: number
  /** Normalized bounding box of largest blob, for debug overlay */
  blobBounds: {
    x: number
    y: number
    w: number
    h: number
  } | null
  /** Corridor polygon points (normalized), for debug overlay */
  corridor: LanePoint[]
}

export const CONFIDENCE_THRESHOLD = 0.35
export const OBSTACLE_SEVERITY_MILD = 0.35
export const OBSTACLE_SEVERITY_HARD = 0.7

export function emptyObstacleResult(): ObstacleResult {
  return {
    present: false,
    severity: 0,
    blobCenter: null,
    blobAreaFrac: 0,
    clearance: 1,
    blobBounds: null,
    corridor: [],
  }
}
