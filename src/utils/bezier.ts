import type { PathPoint } from '../types/path'

export function cubicBezier(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
): number {
  const u = 1 - t
  return (
    u * u * u * p0 +
    3 * u * u * t * p1 +
    3 * u * t * t * p2 +
    t * t * t * p3
  )
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function generatePathPoints(
  centerOffset: number,
  curvature: number,
  count = 32,
): PathPoint[] {
  const points: PathPoint[] = []

  for (let i = 0; i < count; i++) {
    const depth = i / (count - 1)
    const y = 1 - depth
    const curveAmount = curvature * depth * depth
    const x = 0.5 + centerOffset + curveAmount
    points.push({ x, y })
  }

  return points
}
