import type { PathEngine } from '../types/path'
import { DemoPathEngine } from './DemoPathEngine'

export type EngineType = 'demo'

export function createPathEngine(type: EngineType = 'demo'): PathEngine {
  switch (type) {
    case 'demo':
    default:
      return new DemoPathEngine()
  }
}

export { DemoPathEngine }
