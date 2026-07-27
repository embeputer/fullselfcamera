import type { PathEngine } from '../types/path'
import { CVPathEngine } from './CVPathEngine'
import { DemoPathEngine } from './DemoPathEngine'

export type EngineType = 'cv' | 'demo'

export function createPathEngine(type: EngineType = 'cv'): PathEngine {
  switch (type) {
    case 'demo':
      return new DemoPathEngine()
    case 'cv':
    default:
      return new CVPathEngine()
  }
}

export function parseEngineType(): EngineType {
  const param = new URLSearchParams(window.location.search).get('engine')
  return param === 'demo' ? 'demo' : 'cv'
}

export function isDebugCV(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === 'cv'
}

export { CVPathEngine, DemoPathEngine }
