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
  const lastTimeRef = useRef<number | null>(null)
  const lastCaptureRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageDataRef = useRef<ImageData | null>(null)

  useEffect(() => {
    if (!needsFrames) return
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
      canvasRef.current.width = PROC_W
      canvasRef.current.height = PROC_H
    }
  }, [needsFrames])

  useEffect(() => {
    if (!engine || !active) {
      lastTimeRef.current = null
      lastCaptureRef.current = 0
      return
    }

    let rafId: number

    const tick = (now: number) => {
      const last = lastTimeRef.current ?? now
      const deltaMs = now - last
      lastTimeRef.current = now

      let frame: ImageData | undefined
      if (
        needsFrames &&
        videoElement &&
        videoElement.videoWidth > 0 &&
        now - lastCaptureRef.current >= CAPTURE_INTERVAL_MS
      ) {
        lastCaptureRef.current = now
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d', { willReadFrequently: true })
        if (canvas && ctx) {
          ctx.drawImage(videoElement, 0, 0, PROC_W, PROC_H)
          if (!imageDataRef.current) {
            imageDataRef.current = ctx.getImageData(0, 0, PROC_W, PROC_H)
          } else {
            ctx.getImageData(0, 0, PROC_W, PROC_H, imageDataRef.current)
          }
          frame = imageDataRef.current
        }
      }

      const state = engine.update(deltaMs, frame)
      setPathState(state)

      if (engine instanceof CVPathEngine) {
        setCvDetection(engine.getLastDetection())
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      lastTimeRef.current = null
    }
  }, [engine, active, videoElement, needsFrames])

  return { pathState, cvDetection }
}
