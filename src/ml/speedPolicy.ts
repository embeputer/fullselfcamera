import type { SpeedSignal, TurnSignal } from '../types/path'
import {
  OBSTACLE_PRESENT_THRESHOLD,
  OBSTACLE_SEVERITY_MILD,
  PATH_CORRIDOR_LEFT,
  PATH_CORRIDOR_RIGHT,
} from './constants'
import { CONFIDENCE_THRESHOLD, type Detection, type MLObstacleStatus } from './types'

function boxArea(d: Detection): number {
  return (d.x2 - d.x1) * (d.y2 - d.y1)
}

function isObstacleCandidate(d: Detection): boolean {
  return d.isHazard || d.isProximityHazard
}

export function detectionSeverity(d: Detection): number {
  const cx = (d.x1 + d.x2) / 2
  const cy = (d.y1 + d.y2) / 2
  const area = boxArea(d)
  const inPath =
    cx >= PATH_CORRIDOR_LEFT && cx <= PATH_CORRIDOR_RIGHT ? 1 : 0.45
  const nearWeight = 0.35 + cy * 0.65

  if (d.isProximityHazard) {
  // Large close blobs — weight area heavily so hands / partial bodies still trigger
    return Math.min(1, Math.max(d.confidence, 0.35) * area * 14 * nearWeight * inPath)
  }

  if (!d.isHazard) return 0

  return Math.min(1, d.confidence * area * 10 * nearWeight * inPath)
}

export function obstacleStatusFromDetections(
  detections: Detection[],
): MLObstacleStatus {
  const candidates = detections.filter(isObstacleCandidate)
  if (candidates.length === 0) {
    return { present: false, severity: 0, topDetection: null }
  }

  let topDetection: Detection | null = null
  let severity = 0
  for (const d of candidates) {
    const s = detectionSeverity(d)
    if (s > severity) {
      severity = s
      topDetection = d
    }
  }

  return {
    present: severity >= OBSTACLE_PRESENT_THRESHOLD,
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

  if (obstacleSeverity < OBSTACLE_PRESENT_THRESHOLD && turnSignal === 'straight') {
    return 'speed_up'
  }

  return 'maintain'
}
