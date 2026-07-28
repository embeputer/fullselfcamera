import { detectLanes } from '../cv/laneDetector'
import { CONFIDENCE_THRESHOLD, type LaneDetectionResult } from '../cv/types'
import {
  computeMLSpeedSignal,
  obstacleStatusFromDetections,
} from '../ml/speedPolicy'
import type { DetectionResult, MLObstacleStatus } from '../ml/types'
import { emptyDetectionResult, emptyMLObstacleStatus } from '../ml/types'
import {
  destroyYoloModel,
  detectObjects,
  getYoloRuntimeStatus,
  loadYoloModel,
} from '../ml/yoloDetector'
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
  private lastState: PathState = {
    points: [],
    speedSignal: 'slow_down',
    turnSignal: 'straight',
    turnAngle: 0,
    confidence: 0,
  }
  private inferPending = false
  private pendingFrame: ImageData | null = null

  async init(): Promise<void> {
    this.smoothedOffset = 0
    this.smoothedCurvature = 0
    this.smoothedConfidence = 0
    this.smoothedSeverity = 0
    this.lastDetection = null
    this.lastDetections = emptyDetectionResult()
    this.lastObstacle = emptyMLObstacleStatus()
    this.inferPending = false
    this.pendingFrame = null
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

  getYoloStatus() {
    return getYoloRuntimeStatus()
  }

  private scheduleInference(frame: ImageData) {
    this.pendingFrame = frame
    void this.drainInferenceQueue()
  }

  private async drainInferenceQueue() {
    if (this.inferPending) return

    const frame = this.pendingFrame
    if (!frame) return

    this.pendingFrame = null
    this.inferPending = true

    try {
      const result = await detectObjects(frame)
      this.lastDetections = result
      const obstacle = obstacleStatusFromDetections(result.detections)
      this.lastObstacle = obstacle
      this.smoothedSeverity +=
        (obstacle.severity - this.smoothedSeverity) * SEVERITY_SMOOTHING
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('YOLO inference error:', message)
      this.lastDetections = emptyDetectionResult(
        frame.width,
        frame.height,
        'error',
        message,
      )
    } finally {
      this.inferPending = false
      if (this.pendingFrame) {
        void this.drainInferenceQueue()
      }
    }
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

      this.scheduleInference(videoFrame)
    }

    if (this.smoothedConfidence < CONFIDENCE_THRESHOLD) {
      this.lastState = {
        points: [],
        speedSignal: 'slow_down',
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
    this.pendingFrame = null
    destroyYoloModel()
  }
}
