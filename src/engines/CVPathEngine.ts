import { CONFIDENCE_THRESHOLD, type LaneDetectionResult } from '../cv/types'
import { detectLanes } from '../cv/laneDetector'
import type { PathEngine, PathState, TurnSignal } from '../types/path'
import { generatePathPoints } from '../utils/bezier'

const SMOOTHING = 0.25

function turnFromCurvature(curvature: number): {
  signal: TurnSignal
  angle: number
} {
  if (Math.abs(curvature) < 0.05) {
    return { signal: 'straight', angle: 0 }
  }
  const angle = Math.min(45, Math.round(Math.abs(curvature) * 120))
  return {
    signal: curvature > 0 ? 'right' : 'left',
    angle,
  }
}

export class CVPathEngine implements PathEngine {
  private smoothedOffset = 0
  private smoothedCurvature = 0
  private smoothedConfidence = 0
  private lastDetection: LaneDetectionResult | null = null
  private lastState: PathState = {
    points: [],
    speedSignal: 'maintain',
    turnSignal: 'straight',
    turnAngle: 0,
    confidence: 0,
  }

  async init(): Promise<void> {
    this.smoothedOffset = 0
    this.smoothedCurvature = 0
    this.smoothedConfidence = 0
    this.lastDetection = null
    this.lastState = {
      points: [],
      speedSignal: 'maintain',
      turnSignal: 'straight',
      turnAngle: 0,
      confidence: 0,
    }
  }

  getLastDetection(): LaneDetectionResult | null {
    return this.lastDetection
  }

  update(_deltaMs: number, videoFrame?: ImageData): PathState {
    if (videoFrame) {
      const detection = detectLanes(videoFrame)
      this.lastDetection = detection

      this.smoothedOffset +=
        (detection.centerOffset - this.smoothedOffset) * SMOOTHING
      this.smoothedCurvature +=
        (detection.curvature - this.smoothedCurvature) * SMOOTHING
      this.smoothedConfidence +=
        (detection.confidence - this.smoothedConfidence) * SMOOTHING
    }

    if (this.smoothedConfidence < CONFIDENCE_THRESHOLD) {
      this.lastState = {
        points: [],
        speedSignal: 'maintain',
        turnSignal: 'straight',
        turnAngle: 0,
        confidence: this.smoothedConfidence,
      }
      return this.lastState
    }

    const { signal, angle } = turnFromCurvature(this.smoothedCurvature)
    const points = generatePathPoints(
      this.smoothedOffset,
      this.smoothedCurvature,
    )

    this.lastState = {
      points,
      speedSignal: 'maintain',
      turnSignal: signal,
      turnAngle: angle,
      confidence: this.smoothedConfidence,
    }
    return this.lastState
  }

  destroy(): void {
    this.lastDetection = null
  }
}
