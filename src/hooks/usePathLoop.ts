import { useEffect, useRef, useState } from 'react'
import { PROC_H, PROC_W } from '../cv/laneDetector'
import type { LaneDetectionResult } from '../cv/types'
import { CVPathEngine } from '../engines/CVPathEngine'
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
}

export function usePathLoop(
  engine: PathEngine | null,
  active: boolean,
  videoElement: HTMLVideoElement | null,
  needsFrames = true,
): PathLoopResult {
  const [pathState, setPathState] = useState<PathState>(DEFAULT_STATE)
  const [cvDetection, setCvDetection] = useState<LaneDetectionResult | null>(null)
  const engineRef = useRef(engine)
  const videoRef = useRef(videoElement)
  const needsFramesRef = useRef(needsFrames)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)

  engineRef.current = engine
  videoRef.current = videoElement
  needsFramesRef.current = needsFrames

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
          needsFramesRef.current &&
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

  return { pathState, cvDetection }
}
