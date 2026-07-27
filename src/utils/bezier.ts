import type { PathPoint } from '../types/path'

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
