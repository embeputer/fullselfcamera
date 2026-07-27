import { useEffect, useRef } from 'react'
import { PROC_H, PROC_W } from '../cv/laneDetector'
import type { LaneDetectionResult } from '../cv/types'

interface CVDebugOverlayProps {
  detection: LaneDetectionResult | null
  videoElement: HTMLVideoElement | null
}

export function CVDebugOverlay({
  detection,
  videoElement,
}: CVDebugOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const confidenceRef = useRef<HTMLSpanElement>(null)
  const detectionRef = useRef(detection)
  const videoRef = useRef(videoElement)

  detectionRef.current = detection
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

      if (confidenceRef.current) {
        confidenceRef.current.textContent = det
          ? `${(det.confidence * 100).toFixed(0)}%`
          : '—'
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
        CV live — conf <span ref={confidenceRef}>—</span>
      </p>
    </div>
  )
}
