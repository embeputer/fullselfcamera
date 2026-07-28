import { useEffect, useRef } from 'react'
import { HOOD_ZONE_START, PROC_H, PROC_W } from '../ml/constants'
import type { DetectionResult, LaneDetectionResult } from '../ml/types'

interface MLDebugOverlayProps {
  laneDetection: LaneDetectionResult | null
  mlDetections?: DetectionResult | null
  mlLaneInferMs?: number | null
  videoElement: HTMLVideoElement | null
}

const HAZARD_COLOR = 'rgba(239, 68, 68, 0.9)'
const PROXIMITY_COLOR = 'rgba(251, 146, 60, 0.9)'
const OTHER_COLOR = 'rgba(96, 165, 250, 0.85)'

export function CVDebugOverlay({
  laneDetection,
  mlDetections,
  mlLaneInferMs,
  videoElement,
}: MLDebugOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const laneRef = useRef(laneDetection)
  const mlRef = useRef(mlDetections)
  const laneMsRef = useRef(mlLaneInferMs)
  const videoRef = useRef(videoElement)

  laneRef.current = laneDetection
  mlRef.current = mlDetections
  laneMsRef.current = mlLaneInferMs
  videoRef.current = videoElement

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    canvas.width = PROC_W
    canvas.height = PROC_H

    let rafId: number

    const draw = () => {
      const lane = laneRef.current
      const ml = mlRef.current
      const video = videoRef.current
      const w = PROC_W
      const h = PROC_H

      if (video && video.videoWidth > 0) {
        ctx.drawImage(video, 0, 0, w, h)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
        ctx.fillRect(0, 0, w, h)
      } else {
        ctx.fillStyle = '#111'
        ctx.fillRect(0, 0, w, h)
      }

      const hoodY = HOOD_ZONE_START * h
      ctx.fillStyle = 'rgba(100, 100, 100, 0.25)'
      ctx.fillRect(0, hoodY, w, h - hoodY)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(0, hoodY)
      ctx.lineTo(w, hoodY)
      ctx.stroke()
      ctx.setLineDash([])

      if (lane?.edgeMap) {
        const overlay = ctx.createImageData(w, h)
        for (let i = 0; i < lane.edgeMap.length; i++) {
          if (lane.edgeMap[i] > 0) {
            const p = i * 4
            overlay.data[p] = 34
            overlay.data[p + 1] = 197
            overlay.data[p + 2] = 94
            overlay.data[p + 3] = 120
          }
        }
        ctx.putImageData(overlay, 0, 0)

        ctx.fillStyle = '#22c55e'
        for (const p of lane.leftLine) {
          ctx.beginPath()
          ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = '#ef4444'
        for (const p of lane.rightLine) {
          ctx.beginPath()
          ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      if (ml?.detections) {
        for (const d of ml.detections) {
          const bx = d.x1 * w
          const by = d.y1 * h
          const bw = (d.x2 - d.x1) * w
          const bh = (d.y2 - d.y1) * h
          const color = d.isHazard
            ? HAZARD_COLOR
            : d.isProximityHazard
              ? PROXIMITY_COLOR
              : OTHER_COLOR
          ctx.strokeStyle = color
          ctx.lineWidth = d.isHazard || d.isProximityHazard ? 2 : 1
          ctx.strokeRect(bx, by, bw, bh)
          const label = `${d.className} ${(d.confidence * 100).toFixed(0)}%`
          ctx.font = '9px monospace'
          ctx.fillStyle = color
          ctx.fillText(label, bx + 2, Math.max(10, by - 2))
        }
      }

      if (labelRef.current) {
        const conf = lane ? `${(lane.confidence * 100).toFixed(0)}%` : '—'
        if (ml) {
          const sev = `${(ml.topHazardSeverity * 100).toFixed(0)}%`
          const n = `${ml.detections.length} det · ${ml.hazardCount} haz`
          const yoloMs = `${ml.inferenceMs.toFixed(0)}ms`
          const laneMs = laneMsRef.current
            ? `${laneMsRef.current.toFixed(0)}ms`
            : '—'
          const infer =
            ml.inferenceStatus === 'error'
              ? 'yolo: FAIL'
              : ml.inferenceStatus === 'running'
                ? 'yolo: run'
                : ml.inferenceStatus === 'ok'
                  ? 'yolo: ok'
                  : 'yolo: —'
          const err =
            ml.inferenceError && ml.inferenceStatus === 'error'
              ? ` · ${ml.inferenceError.slice(0, 30)}`
              : ''
          labelRef.current.textContent = `lane ${conf} · ${laneMs} · ${infer} · sev ${sev} · ${n} · ${yoloMs}${err}`
        } else {
          labelRef.current.textContent = `lane ${conf}`
        }
      }

      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="pointer-events-none absolute bottom-20 left-4 overflow-hidden rounded-lg border border-white/30 bg-black/70">
      <canvas
        ref={canvasRef}
        style={{ width: 200, height: 112, imageRendering: 'pixelated' }}
      />
      <p className="px-2 py-1 font-mono text-[10px] text-white/60">
        ML live — <span ref={labelRef}>—</span>
      </p>
    </div>
  )
}
