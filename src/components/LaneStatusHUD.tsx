import {
  CONFIDENCE_THRESHOLD,
  OBSTACLE_SEVERITY_MILD,
} from '../cv/types'

interface LaneStatusHUDProps {
  confidence: number
  obstaclePresent?: boolean
  obstacleSeverity?: number
}

export function LaneStatusHUD({
  confidence,
  obstaclePresent = false,
  obstacleSeverity = 0,
}: LaneStatusHUDProps) {
  const detected = confidence >= CONFIDENCE_THRESHOLD
  const blocked =
    detected && (obstaclePresent || obstacleSeverity >= OBSTACLE_SEVERITY_MILD)

  let color = '#eab308'
  let label = 'SEARCHING'
  if (detected && blocked) {
    color = '#ef4444'
    label = 'OBSTACLE'
  } else if (detected) {
    color = '#22c55e'
    label = 'CLEAR'
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/50 px-3 py-2 font-mono text-xs tracking-wider text-white/80 backdrop-blur-sm">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  )
}
