import { CONFIDENCE_THRESHOLD, type LaneDetectionResult } from '../cv/types'
import { LANE_INFERENCE_INTERVAL_MS, ML_INFERENCE_INTERVAL_MS } from '../ml/constants'
import {
  destroyLaneSegModel,
  detectLaneMask,
  getLaneSegRuntimeStatus,
  loadLaneSegModel,
} from '../ml/laneSegDetector'
import { pathFromLaneMask } from '../ml/pathFromMask'
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
  private yoloPending = false
  private lanePending = false
  private lastYoloScheduled = 0
  private lastLaneScheduled = 0
  private lastLaneInferMs = 0
  private staggerLaneNext = true

  async init(): Promise<void> {
    this.smoothedOffset = 0
    this.smoothedCurvature = 0
    this.smoothedConfidence = 0
    this.smoothedSeverity = 0
    this.lastDetection = null
    this.lastDetections = emptyDetectionResult()
    this.lastObstacle = emptyMLObstacleStatus()
    this.yoloPending = false
    this.lanePending = false
    this.lastYoloScheduled = 0
    this.lastLaneScheduled = 0
    this.staggerLaneNext = true

    await Promise.all([loadYoloModel(), loadLaneSegModel()])

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

  getLaneStatus() {
    return getLaneSegRuntimeStatus()
  }

  getLastLaneInferMs(): number {
    return this.lastLaneInferMs
  }

  private scheduleInference(frame: ImageData) {
    const now = performance.now()
    const yoloDue = now - this.lastYoloScheduled >= ML_INFERENCE_INTERVAL_MS
    const laneDue = now - this.lastLaneScheduled >= LANE_INFERENCE_INTERVAL_MS

    if (!yoloDue && !laneDue) return

    if (yoloDue && laneDue && this.yoloPending && this.lanePending) {
      return
    }

    if (yoloDue && laneDue) {
      if (this.staggerLaneNext) {
        if (!this.lanePending) {
          this.lastLaneScheduled = now
          void this.runLaneInference(frame)
        }
        this.staggerLaneNext = false
      } else if (!this.yoloPending) {
        this.lastYoloScheduled = now
        void this.runYoloInference(frame)
        this.staggerLaneNext = true
      }
      return
    }

    if (laneDue && !this.lanePending) {
      this.lastLaneScheduled = now
      void this.runLaneInference(frame)
    }
    if (yoloDue && !this.yoloPending) {
      this.lastYoloScheduled = now
      void this.runYoloInference(frame)
    }
  }

  private async runLaneInference(frame: ImageData) {
    if (this.lanePending) return
    this.lanePending = true

    try {
      const seg = await detectLaneMask(frame)
      if (seg.inferenceStatus === 'ok' && seg.mask.length > 0) {
        this.lastLaneInferMs = seg.inferenceMs
        const detection = pathFromLaneMask(
          seg.mask,
          seg.maskWidth,
          seg.maskHeight,
        )
        detection.confidence = Math.max(
          detection.confidence,
          seg.confidence * 0.5,
        )
        this.lastDetection = detection

        this.smoothedOffset +=
          (detection.centerOffset - this.smoothedOffset) * SMOOTHING
        this.smoothedCurvature +=
          (detection.curvature - this.smoothedCurvature) * SMOOTHING
        this.smoothedConfidence +=
          (detection.confidence - this.smoothedConfidence) * SMOOTHING
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Lane inference error:', message)
    } finally {
      this.lanePending = false
    }
  }

  private async runYoloInference(frame: ImageData) {
    if (this.yoloPending) return
    this.yoloPending = true

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
      this.yoloPending = false
    }
  }

  update(_deltaMs: number, videoFrame?: ImageData): PathState {
    if (videoFrame) {
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
    destroyYoloModel()
    destroyLaneSegModel()
  }
}
