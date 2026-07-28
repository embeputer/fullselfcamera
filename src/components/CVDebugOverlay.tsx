import { useEffect, useRef } from 'react'
import { PROC_H, PROC_W } from '../cv/laneDetector'
import type { LaneDetectionResult, ObstacleResult } from '../cv/types'
import { HOOD_ZONE_START } from '../ml/constants'
import type { DetectionResult } from '../ml/types'

interface CVDebugOverlayProps {
  detection: LaneDetectionResult | null
  obstacle: ObstacleResult | null
  mlDetections?: DetectionResult | null
  videoElement: HTMLVideoElement | null
}

const HAZARD_COLOR = 'rgba(239, 68, 68, 0.9)'
const PROXIMITY_COLOR = 'rgba(251, 146, 60, 0.9)'
const OTHER_COLOR = 'rgba(96, 165, 250, 0.85)'

export function CVDebugOverlay({
  detection,
  obstacle,
  mlDetections,
  videoElement,
}: CVDebugOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const detectionRef = useRef(detection)
  const obstacleRef = useRef(obstacle)
  const mlRef = useRef(mlDetections)
  const videoRef = useRef(videoElement)

  detectionRef.current = detection
  obstacleRef.current = obstacle
  mlRef.current = mlDetections
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
      const det = detectionRef.current
      const obs = obstacleRef.current
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

      // Hood exclusion zone
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

      if (det?.edgeMap) {
        const overlay = ctx.createImageData(w, h)
        for (let i = 0; i < det.edgeMap.length; i++) {
          if (det.edgeMap[i] > 0) {
            const p = i * 4
            overlay.data[p] = 0
            overlay.data[p + 1] = 200
            overlay.data[p + 2] = 255
            overlay.data[p + 3] = 180
          }
        }
        ctx.putImageData(overlay, 0, 0)

        ctx.fillStyle = '#22c55e'
        for (const p of det.leftLine) {
          ctx.beginPath()
          ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = '#ef4444'
        for (const p of det.rightLine) {
          ctx.beginPath()
          ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      if (obs?.corridor && obs.corridor.length >= 3) {
        ctx.beginPath()
        obs.corridor.forEach((p, i) => {
          const x = p.x * w
          const y = p.y * h
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = 'rgba(250, 204, 21, 0.08)'
        ctx.fill()
      }

      if (obs?.blobBounds && obs.present) {
        const b = obs.blobBounds
        const color =
          obs.severity >= 0.7
            ? 'rgba(239, 68, 68, 0.85)'
            : 'rgba(250, 204, 21, 0.85)'
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h)
        if (obs.blobCenter) {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(obs.blobCenter.x * w, obs.blobCenter.y * h, 4, 0, Math.PI * 2)
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
        const conf = det ? `${(det.confidence * 100).toFixed(0)}%` : '—'
        if (ml) {
          const sev = `${(ml.topHazardSeverity * 100).toFixed(0)}%`
          const n = `${ml.detections.length} det · ${ml.hazardCount} haz`
          const ms = `${ml.inferenceMs.toFixed(0)}ms`
          labelRef.current.textContent = `conf ${conf} · sev ${sev} · ${n} · ${ms}`
        } else {
          const sev = obs ? `${(obs.severity * 100).toFixed(0)}%` : '—'
          const clr = obs ? `${(obs.clearance * 100).toFixed(0)}%` : '—'
          labelRef.current.textContent = `conf ${conf} · sev ${sev} · clr ${clr}`
        }
      }

      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const modeLabel = mlDetections ? 'ML+CV' : 'CV'

  return (
    <div className="pointer-events-none absolute bottom-20 left-4 overflow-hidden rounded-lg border border-white/30 bg-black/70">
      <canvas
        ref={canvasRef}
        style={{ width: 200, height: 112, imageRendering: 'pixelated' }}
      />
      <p className="px-2 py-1 font-mono text-[10px] text-white/60">
        {modeLabel} live — <span ref={labelRef}>—</span>
      </p>
    </div>
  )
}
