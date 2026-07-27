import { useEffect, useRef, useState } from 'react'
import type { PathEngine, PathState } from '../types/path'

const DEFAULT_STATE: PathState = {
  points: [],
  speedSignal: 'maintain',
  turnSignal: 'straight',
  turnAngle: 0,
  confidence: 1,
}

export function usePathLoop(
  engine: PathEngine | null,
  active: boolean,
): PathState {
  const [pathState, setPathState] = useState<PathState>(DEFAULT_STATE)
  const lastTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (!engine || !active) {
      lastTimeRef.current = null
      return
    }

    let rafId: number

    const tick = (now: number) => {
      const last = lastTimeRef.current ?? now
      const deltaMs = now - last
      lastTimeRef.current = now
      setPathState(engine.update(deltaMs))
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      lastTimeRef.current = null
    }
  }, [engine, active])

  return pathState
}
