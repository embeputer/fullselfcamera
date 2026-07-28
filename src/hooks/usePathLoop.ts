import { useEffect, useRef, useState } from 'react'
import { PROC_H, PROC_W } from '../cv/laneDetector'
import type { LaneDetectionResult, ObstacleResult } from '../cv/types'
import { CVPathEngine } from '../engines/CVPathEngine'
import { MLPathEngine } from '../engines/MLPathEngine'
import type { DetectionResult, MLObstacleStatus } from '../ml/types'
import type { PathEngine, PathState } from '../types/path'

const DEFAULT_STATE: PathState = {
  points: [],
  speedSignal: 'maintain',
  turnSignal: 'straight',
  turnAngle: 0,
  confidence: 0,
}

const CAPTURE_INTERVAL_MS = 100

export interface PathLoopResult {
  pathState: PathState
  cvDetection: LaneDetectionResult | null
  cvObstacle: ObstacleResult | null
  mlDetections: DetectionResult | null
  mlObstacle: MLObstacleStatus | null
  mlInferenceError: string | null
}

export function usePathLoop(
  engine: PathEngine | null,
  active: boolean,
  videoElement: HTMLVideoElement | null,
): PathLoopResult {
  const [pathState, setPathState] = useState<PathState>(DEFAULT_STATE)
  const [cvDetection, setCvDetection] = useState<LaneDetectionResult | null>(
    null,
  )
  const [cvObstacle, setCvObstacle] = useState<ObstacleResult | null>(null)
  const [mlDetections, setMlDetections] = useState<DetectionResult | null>(
    null,
  )
  const [mlObstacle, setMlObstacle] = useState<MLObstacleStatus | null>(null)
  const [mlInferenceError, setMlInferenceError] = useState<string | null>(null)
  const engineRef = useRef(engine)
  const videoRef = useRef(videoElement)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)

  engineRef.current = engine
  videoRef.current = videoElement

  useEffect(() => {
    if (!canvasRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = PROC_W
      canvas.height = PROC_H
      canvasRef.current = canvas
      ctxRef.current = canvas.getContext('2d', { willReadFrequently: true })
    }
  }, [])

  useEffect(() => {
    if (!engine || !active) return

    let rafId = 0
    let lastTick = 0
    let lastCapture = 0

    const tick = (now: number) => {
      try {
        const deltaMs = lastTick ? now - lastTick : 16
        lastTick = now

        let frame: ImageData | undefined
        const video = videoRef.current
        const ctx = ctxRef.current
        const canvas = canvasRef.current

        if (
          video &&
          video.videoWidth > 0 &&
          canvas &&
          ctx &&
          now - lastCapture >= CAPTURE_INTERVAL_MS
        ) {
          lastCapture = now
          ctx.drawImage(video, 0, 0, PROC_W, PROC_H)
          frame = ctx.getImageData(0, 0, PROC_W, PROC_H)
        }

        const currentEngine = engineRef.current
        if (currentEngine) {
          const state = currentEngine.update(deltaMs, frame)
          setPathState(state)
          if (currentEngine instanceof CVPathEngine) {
            setCvDetection(currentEngine.getLastDetection())
            setCvObstacle(currentEngine.getLastObstacle())
            setMlDetections(null)
            setMlObstacle(null)
            setMlInferenceError(null)
          } else if (currentEngine instanceof MLPathEngine) {
            setCvDetection(currentEngine.getLastDetection())
            setCvObstacle(null)
            setMlDetections(currentEngine.getLastDetections())
            setMlObstacle(currentEngine.getLastObstacle())
            setMlInferenceError(currentEngine.getLastInferenceError())
          }
        }
      } catch (err) {
        console.error('Path loop error:', err)
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [engine, active])

  return { pathState, cvDetection, cvObstacle, mlDetections, mlObstacle, mlInferenceError }
}
