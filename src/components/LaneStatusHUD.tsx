import { CONFIDENCE_THRESHOLD } from '../cv/types'

interface LaneStatusHUDProps {
  confidence: number
}

export function LaneStatusHUD({ confidence }: LaneStatusHUDProps) {
  const detected = confidence >= CONFIDENCE_THRESHOLD
  const color = detected ? '#22c55e' : '#eab308'
  const label = detected ? 'LANES' : 'SEARCHING'

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
