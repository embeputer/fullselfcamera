import type { SpeedSignal, TurnSignal } from '../types/path'
import { CONFIDENCE_THRESHOLD } from '../cv/types'
import {
  OBSTACLE_SEVERITY_MILD,
  PATH_CORRIDOR_LEFT,
  PATH_CORRIDOR_RIGHT,
} from './constants'
import type { Detection, MLObstacleStatus } from './types'

export function detectionSeverity(d: Detection): number {
  const cx = (d.x1 + d.x2) / 2
  const cy = (d.y1 + d.y2) / 2
  const area = (d.x2 - d.x1) * (d.y2 - d.y1)
  const inPath =
    cx >= PATH_CORRIDOR_LEFT && cx <= PATH_CORRIDOR_RIGHT ? 1 : 0.45
  const nearWeight = 0.35 + cy * 0.65
  return Math.min(1, d.confidence * area * 10 * nearWeight * inPath)
}

export function obstacleStatusFromDetections(
  detections: Detection[],
): MLObstacleStatus {
  const hazards = detections.filter((d) => d.isHazard)
  if (hazards.length === 0) {
    return { present: false, severity: 0, topDetection: null }
  }

  let topDetection: Detection | null = null
  let severity = 0
  for (const d of hazards) {
    const s = detectionSeverity(d)
    if (s > severity) {
      severity = s
      topDetection = d
    }
  }

  return {
    present: severity >= 0.12,
    severity,
    topDetection,
  }
}

export function computeMLSpeedSignal(
  laneConfidence: number,
  obstacleSeverity: number,
  turnSignal: TurnSignal,
): SpeedSignal {
  if (laneConfidence < CONFIDENCE_THRESHOLD) {
    return 'slow_down'
  }

  if (obstacleSeverity >= OBSTACLE_SEVERITY_MILD) {
    return 'slow_down'
  }

  if (obstacleSeverity < 0.12 && turnSignal === 'straight') {
    return 'speed_up'
  }

  return 'maintain'
}
