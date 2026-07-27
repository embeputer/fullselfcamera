export interface ScreenPoint {
  x: number
  y: number
}

export interface PathRibbon {
  left: ScreenPoint[]
  right: ScreenPoint[]
}

export function curvatureFromPoints(
  points: { x: number; y: number }[],
): number {
  if (points.length === 0) return 0
  const bottom = points[points.length - 1]
  return bottom.x - 0.5
}

/** Grounded lane-marker ribbon sitting on the road ahead. */
export function buildPathRibbon(
  width: number,
  height: number,
  curvature: number,
  segments = 24,
): PathRibbon {
  const nearY = height * 0.9
  const farY = height * 0.52
  const nearHalfW = width * 0.12
  const farHalfW = width * 0.035

  const left: ScreenPoint[] = []
  const right: ScreenPoint[] = []

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const y = farY + t * (nearY - farY)
    const halfW = farHalfW + t * (nearHalfW - farHalfW)
    const drift = curvature * width * Math.pow(1 - t, 2) * 0.32
    const centerX = width * 0.5 + drift

    left.push({ x: centerX - halfW, y })
    right.push({ x: centerX + halfW, y })
  }

  return { left, right }
}
