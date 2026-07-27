import type { PathEngine, PathState, SpeedSignal, TurnSignal } from '../types/path'
import { easeInOut, generatePathPoints, lerp } from '../utils/bezier'

interface Segment {
  duration: number
  endCurvature: number
  speedSignal: SpeedSignal
  turnSignal: TurnSignal
  turnAngle: number
}

const SEGMENTS: Segment[] = [
  {
    duration: 4000,
    endCurvature: 0,
    speedSignal: 'maintain',
    turnSignal: 'straight',
    turnAngle: 0,
  },
  {
    duration: 3000,
    endCurvature: 0.22,
    speedSignal: 'slow_down',
    turnSignal: 'right',
    turnAngle: 25,
  },
  {
    duration: 3000,
    endCurvature: 0,
    speedSignal: 'speed_up',
    turnSignal: 'straight',
    turnAngle: 0,
  },
  {
    duration: 3000,
    endCurvature: -0.35,
    speedSignal: 'slow_down',
    turnSignal: 'left',
    turnAngle: 45,
  },
]

const TOTAL_DURATION = SEGMENTS.reduce((sum, s) => sum + s.duration, 0)

export class DemoPathEngine implements PathEngine {
  private elapsed = 0

  async init(): Promise<void> {
    this.elapsed = 0
  }

  update(deltaMs: number): PathState {
    this.elapsed = (this.elapsed + deltaMs) % TOTAL_DURATION

    let timeAcc = 0
    let segmentIndex = 0
    let segmentT = 0

    for (let i = 0; i < SEGMENTS.length; i++) {
      const seg = SEGMENTS[i]
      if (this.elapsed < timeAcc + seg.duration) {
        segmentIndex = i
        segmentT = (this.elapsed - timeAcc) / seg.duration
        break
      }
      timeAcc += seg.duration
    }

    const current = SEGMENTS[segmentIndex]
    const prev = SEGMENTS[(segmentIndex - 1 + SEGMENTS.length) % SEGMENTS.length]
    const eased = easeInOut(segmentT)

    const startCurvature = segmentIndex === 0 ? 0 : prev.endCurvature
    const curvature = lerp(startCurvature, current.endCurvature, eased)
    const centerOffset = lerp(0, 0, eased)

    const turnAngle =
      current.turnSignal === 'straight'
        ? lerp(prev.turnAngle, 0, eased)
        : lerp(0, current.turnAngle, eased)

    const points = generatePathPoints(centerOffset, curvature)

    return {
      points,
      speedSignal: current.speedSignal,
      turnSignal: current.turnSignal,
      turnAngle: Math.round(turnAngle),
      confidence: 1,
    }
  }

  destroy(): void {
    this.elapsed = 0
  }
}
