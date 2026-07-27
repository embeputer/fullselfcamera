import { useEffect, useRef } from 'react'
import type { LaneDetectionResult } from '../cv/types'

interface CVDebugOverlayProps {
  detection: LaneDetectionResult | null
}

export function CVDebugOverlay({ detection }: CVDebugOverlayProps) {
  if (!detection?.edgeMap) return null

  const { edgeMap, width, height, leftLine, rightLine, confidence } = detection

  return (
    <div className="pointer-events-none absolute bottom-20 left-4 overflow-hidden rounded-lg border border-white/30 bg-black/70">
      <CVDebugCanvas
        edgeMap={edgeMap}
        width={width}
        height={height}
        leftLine={leftLine}
        rightLine={rightLine}
      />
      <p className="px-2 py-1 font-mono text-[10px] text-white/60">
        CV debug — conf {(confidence * 100).toFixed(0)}%
      </p>
    </div>
  )
}

function CVDebugCanvas({
  edgeMap,
  width,
  height,
  leftLine,
  rightLine,
}: {
  edgeMap: Uint8Array
  width: number
  height: number
  leftLine: LaneDetectionResult['leftLine']
  rightLine: LaneDetectionResult['rightLine']
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = width
    canvas.height = height
    const imageData = ctx.createImageData(width, height)
    for (let i = 0; i < edgeMap.length; i++) {
      const v = edgeMap[i]
      const p = i * 4
      imageData.data[p] = v
      imageData.data[p + 1] = v
      imageData.data[p + 2] = v
      imageData.data[p + 3] = 255
    }
    ctx.putImageData(imageData, 0, 0)

    ctx.fillStyle = '#22c55e'
    for (const p of leftLine) {
      ctx.fillRect(p.x * width - 2, p.y * height - 2, 4, 4)
    }
    ctx.fillStyle = '#ef4444'
    for (const p of rightLine) {
      ctx.fillRect(p.x * width - 2, p.y * height - 2, 4, 4)
    }
  }, [edgeMap, width, height, leftLine, rightLine])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: 160, height: 90, imageRendering: 'pixelated' }}
    />
  )
}
