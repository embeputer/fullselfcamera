import type { PathEngine } from '../types/path'
import { CVPathEngine } from './CVPathEngine'
import { MLPathEngine } from './MLPathEngine'

export type EngineMode = 'cv' | 'ml'

export function getEngineMode(): EngineMode {
  const params = new URLSearchParams(window.location.search)
  const engine = params.get('engine')
  if (engine === 'cv') return 'cv'
  return 'ml'
}

export function createPathEngine(): PathEngine {
  if (getEngineMode() === 'cv') {
    return new CVPathEngine()
  }
  return new MLPathEngine()
}

export function isDebugCV(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === 'cv'
}

export { CVPathEngine, MLPathEngine }
