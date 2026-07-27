export type SpeedSignal = 'speed_up' | 'maintain' | 'slow_down'
export type TurnSignal = 'left' | 'right' | 'straight'

export interface PathPoint {
  x: number
  y: number
}

export interface PathState {
  points: PathPoint[]
  speedSignal: SpeedSignal
  turnSignal: TurnSignal
  turnAngle: number
  confidence: number
}

export interface PathEngine {
  init(): Promise<void>
  update(deltaMs: number, videoFrame?: ImageData): PathState
  destroy(): void
}
