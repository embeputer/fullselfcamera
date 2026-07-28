import type { PathEngine } from '../types/path'
import { MLPathEngine } from './MLPathEngine'

export function createPathEngine(): PathEngine {
  return new MLPathEngine()
}

export function isDebugML(): boolean {
  const debug = new URLSearchParams(window.location.search).get('debug')
  return debug === 'ml' || debug === '1' || debug === 'true'
}

export { MLPathEngine }
