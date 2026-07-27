import { useEffect, useRef } from 'react'
import type { PathState } from '../types/path'
import {
  buildPathRibbon,
  curvatureFromPoints,
  type PathRibbon,
  type ScreenPoint,
} from '../utils/perspective'

interface FSDOverlayProps {
  pathState: PathState
}

const PATH_LINE = '#2B7FFF'
const PATH_FILL = 'rgba(12, 45, 110, 0.48)'

function traceEdge(ctx: CanvasRenderingContext2D, edge: ScreenPoint[]) {
  if (edge.length < 2) return
  ctx.moveTo(edge[0].x, edge[0].y)
  for (let i = 1; i < edge.length; i++) ctx.lineTo(edge[i].x, edge[i].y)
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  ribbon: PathRibbon,
) {
  const { left, right } = ribbon
  if (left.length < 2) return

  const farLeft = left[0]
  const farRight = right[0]
  const capX = (farLeft.x + farRight.x) / 2
  const capY = farLeft.y - 6

  ctx.beginPath()
  traceEdge(ctx, left)
  for (let i = right.length - 1; i >= 0; i--) {
    ctx.lineTo(right[i].x, right[i].y)
  }
  ctx.quadraticCurveTo(capX, capY, farLeft.x, farLeft.y)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  traceEdge(ctx, left)
  ctx.stroke()

  ctx.beginPath()
  traceEdge(ctx, right)
  ctx.stroke()
}

export function FSDOverlay({ pathState }: FSDOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.width / dpr
    const height = canvas.height / dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const { points } = pathState
    if (points.length < 2) return

    const curvature = curvatureFromPoints(points)
    const ribbon = buildPathRibbon(width, height, curvature)

    ctx.fillStyle = PATH_FILL
    ctx.strokeStyle = PATH_LINE
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = 1

    drawRibbon(ctx, ribbon)
  }, [pathState])

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}
