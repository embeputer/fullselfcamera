import { detectLanes } from '../cv/laneDetector'
import { CONFIDENCE_THRESHOLD, type LaneDetectionResult } from '../cv/types'
import {
  computeMLSpeedSignal,
  obstacleStatusFromDetections,
} from '../ml/speedPolicy'
import type { DetectionResult, MLObstacleStatus } from '../ml/types'
import { emptyDetectionResult, emptyMLObstacleStatus } from '../ml/types'
import { destroyYoloModel, detectObjects, loadYoloModel } from '../ml/yoloDetector'
import type { PathEngine, PathState, TurnSignal } from '../types/path'
import { generatePathPoints } from '../utils/bezier'

const SMOOTHING = 0.25
const SEVERITY_SMOOTHING = 0.3

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

export class MLPathEngine implements PathEngine {
  private smoothedOffset = 0
  private smoothedCurvature = 0
  private smoothedConfidence = 0
  private smoothedSeverity = 0
  private lastDetection: LaneDetectionResult | null = null
  private lastDetections: DetectionResult = emptyDetectionResult()
  private lastObstacle: MLObstacleStatus = emptyMLObstacleStatus()
  private lastInferenceError: string | null = null
  private lastState: PathState = {
    points: [],
    speedSignal: 'slow_down',
    turnSignal: 'straight',
    turnAngle: 0,
    confidence: 0,
  }
  private inferPending = false
  private queuedFrame: ImageData | null = null

  async init(): Promise<void> {
    this.smoothedOffset = 0
    this.smoothedCurvature = 0
    this.smoothedConfidence = 0
    this.smoothedSeverity = 0
    this.lastDetection = null
    this.lastDetections = emptyDetectionResult()
    this.lastObstacle = emptyMLObstacleStatus()
    this.lastInferenceError = null
    this.inferPending = false
    this.queuedFrame = null
    await loadYoloModel()
    this.lastState = {
      points: [],
      speedSignal: 'slow_down',
      turnSignal: 'straight',
      turnAngle: 0,
      confidence: 0,
    }
  }

  getLastDetection(): LaneDetectionResult | null {
    return this.lastDetection
  }

  getLastDetections(): DetectionResult {
    return this.lastDetections
  }

  getLastObstacle(): MLObstacleStatus {
    return this.lastObstacle
  }

  getLastInferenceError(): string | null {
    return this.lastInferenceError
  }

  private runInference(frame: ImageData): void {
    this.inferPending = true
    void detectObjects(frame)
      .then((result) => {
        this.lastInferenceError = null
        this.lastDetections = result
        const obstacle = obstacleStatusFromDetections(result.detections)
        this.lastObstacle = obstacle
        this.smoothedSeverity +=
          (obstacle.severity - this.smoothedSeverity) * SEVERITY_SMOOTHING
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : 'YOLO inference failed'
        this.lastInferenceError = message
        console.error('YOLO inference error:', err)
      })
      .finally(() => {
        const next = this.queuedFrame
        this.queuedFrame = null
        if (next) {
          this.runInference(next)
        } else {
          this.inferPending = false
        }
      })
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

      if (!this.inferPending) {
        this.runInference(videoFrame)
      } else {
        this.queuedFrame = videoFrame
      }
    }

    if (this.smoothedConfidence < CONFIDENCE_THRESHOLD) {
      this.lastState = {
        points: [],
        speedSignal: computeMLSpeedSignal(
          this.smoothedConfidence,
          this.smoothedSeverity,
          'straight',
        ),
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
    const speedSignal = computeMLSpeedSignal(
      this.smoothedConfidence,
      this.smoothedSeverity,
      signal,
    )

    this.lastState = {
      points,
      speedSignal,
      turnSignal: signal,
      turnAngle: angle,
      confidence: this.smoothedConfidence,
    }
    return this.lastState
  }

  destroy(): void {
    this.lastDetection = null
    this.lastDetections = emptyDetectionResult()
    this.lastObstacle = emptyMLObstacleStatus()
    this.lastInferenceError = null
    this.queuedFrame = null
    destroyYoloModel()
  }
}
