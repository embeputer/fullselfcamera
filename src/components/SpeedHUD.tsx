import type { SpeedSignal } from '../types/path'

interface SpeedHUDProps {
  signal: SpeedSignal
}

const LABELS: Record<SpeedSignal, string> = {
  speed_up: 'SPEED UP',
  maintain: 'MAINTAIN',
  slow_down: 'SLOW DOWN',
}

const COLORS: Record<SpeedSignal, string> = {
  speed_up: '#22c55e',
  maintain: '#eab308',
  slow_down: '#ef4444',
}

export function SpeedHUD({ signal }: SpeedHUDProps) {
  const color = COLORS[signal]
  const pulsing = signal === 'slow_down'

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`rounded-lg border px-4 py-2 font-mono text-sm font-semibold tracking-wider backdrop-blur-sm ${pulsing ? 'animate-pulse-slow' : ''}`}
        style={{
          borderColor: color,
          color,
          backgroundColor: `${color}22`,
        }}
      >
        {LABELS[signal]}
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pulsing ? 'animate-pulse-slow' : ''}`}
          style={{
            backgroundColor: color,
            width:
              signal === 'speed_up'
                ? '100%'
                : signal === 'maintain'
                  ? '60%'
                  : '30%',
          }}
        />
      </div>
    </div>
  )
}
