import type { TurnSignal } from '../types/path'

interface TurnHUDProps {
  signal: TurnSignal
  angle: number
}

const ARROWS: Record<TurnSignal, string> = {
  left: '↰',
  right: '↱',
  straight: '↑',
}

const LABELS: Record<TurnSignal, string> = {
  left: 'LEFT',
  right: 'RIGHT',
  straight: 'STRAIGHT',
}

export function TurnHUD({ signal, angle }: TurnHUDProps) {
  const visible = signal !== 'straight'

  return (
    <div
      className={`rounded-lg border border-cyan-400/60 bg-cyan-950/50 px-4 py-2 font-mono text-sm font-semibold tracking-wider text-cyan-300 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-40'}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{ARROWS[signal]}</span>
        <span>{LABELS[signal]}</span>
        {visible && <span className="text-cyan-400">{angle}°</span>}
      </div>
    </div>
  )
}
