import type { SpeedSignal, TurnSignal } from '../types/path'
import {
  CONFIDENCE_THRESHOLD,
  OBSTACLE_SEVERITY_HARD,
  OBSTACLE_SEVERITY_MILD,
} from './types'

export function computeSpeedSignal(
  laneConfidence: number,
  obstacleSeverity: number,
  turnSignal: TurnSignal,
): SpeedSignal {
  if (laneConfidence < CONFIDENCE_THRESHOLD) {
    return 'slow_down'
  }

  // Both mild and hard map to slow_down for now; hard is reserved for future RC stop
  if (
    obstacleSeverity >= OBSTACLE_SEVERITY_MILD ||
    obstacleSeverity >= OBSTACLE_SEVERITY_HARD
  ) {
    return 'slow_down'
  }

  if (obstacleSeverity < 0.12 && turnSignal === 'straight') {
    return 'speed_up'
  }

  return 'maintain'
}
