import type { PathEngine } from '../types/path'
import { CVPathEngine } from './CVPathEngine'

export function createPathEngine(): PathEngine {
  return new CVPathEngine()
}

export function isDebugCV(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === 'cv'
}

export { CVPathEngine }
