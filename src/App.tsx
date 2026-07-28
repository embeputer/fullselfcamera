import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraSwitcher } from './components/CameraSwitcher'
import { CVDebugOverlay } from './components/CVDebugOverlay'
import { CameraFeed } from './components/CameraFeed'
import { FSDOverlay } from './components/FSDOverlay'
import { LaneStatusHUD } from './components/LaneStatusHUD'
import { SpeedHUD } from './components/SpeedHUD'
import { StartScreen } from './components/StartScreen'
import { TurnHUD } from './components/TurnHUD'
import {
  createPathEngine,
  getEngineMode,
  isDebugCV,
} from './engines'
import { useCamera } from './hooks/useCamera'
import { usePathLoop } from './hooks/usePathLoop'

type AppPhase = 'start' | 'driving'

function App() {
  const [phase, setPhase] = useState<AppPhase>('start')
  const engineRef = useRef(createPathEngine())
  const [engineReady, setEngineReady] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)
  const debugCV = isDebugCV()
  const engineMode = getEngineMode()

  const {
    videoRef,
    videoElement,
    status,
    error,
    isMirrored,
    devices,
    activeDeviceId,
    start,
    switchCamera,
    stop,
  } = useCamera()
  const active = phase === 'driving' && status === 'active'
  const { pathState, cvDetection, cvObstacle, mlDetections, mlObstacle, mlInferenceError } =
    usePathLoop(engineReady ? engineRef.current : null, active, videoElement)

  useEffect(() => {
    setEngineReady(false)
    setEngineError(null)
    engineRef.current
      .init()
      .then(() => setEngineReady(true))
      .catch((err: unknown) => {
        console.error('Engine init failed:', err)
        setEngineError(
          err instanceof Error ? err.message : 'Failed to load ML model',
        )
      })
    return () => engineRef.current.destroy()
  }, [])

  const handleStart = useCallback(() => {
    setPhase('driving')
  }, [])

  useEffect(() => {
    if (phase === 'driving' && status === 'idle') {
      void start()
    }
  }, [phase, status, start])

  const handleStop = useCallback(() => {
    stop()
    setPhase('start')
  }, [stop])

  const obstaclePresent = mlObstacle?.present ?? cvObstacle?.present
  const obstacleSeverity = mlObstacle?.severity ?? cvObstacle?.severity

  if (phase === 'start') {
    return (
      <StartScreen
        onStart={handleStart}
        loading={status === 'requesting' || !engineReady}
        error={engineError ?? error}
        subtitle={
          !engineReady && !engineError
            ? engineMode === 'ml'
              ? 'Loading YOLO model…'
              : 'Initializing engine…'
            : undefined
        }
      />
    )
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <CameraFeed ref={videoRef} mirrored={isMirrored} className="absolute inset-0" />

      {status === 'active' && (
        <>
          <FSDOverlay pathState={pathState} />
          {debugCV && (
            <CVDebugOverlay
              detection={cvDetection}
              obstacle={cvObstacle}
              mlDetections={mlDetections}
              videoElement={videoElement}
            />
          )}

          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
            <div className="flex items-start justify-between gap-4">
              <div className="w-40">
                <SpeedHUD signal={pathState.speedSignal} />
              </div>
              <TurnHUD
                signal={pathState.turnSignal}
                angle={pathState.turnAngle}
              />
            </div>

            <div className="pointer-events-auto flex flex-col items-center justify-center gap-2">
              {mlInferenceError && (
                <p className="rounded-full border border-red-400/40 bg-red-950/60 px-3 py-1 font-mono text-[10px] text-red-200">
                  ML error: {mlInferenceError}
                </p>
              )}
              <div className="flex items-center justify-center gap-3">
              <LaneStatusHUD
                confidence={pathState.confidence}
                obstaclePresent={obstaclePresent}
                obstacleSeverity={obstacleSeverity}
              />
              <CameraSwitcher
                devices={devices}
                activeDeviceId={activeDeviceId}
                onSwitch={(id) => void switchCamera(id)}
              />
              <button
                onClick={handleStop}
                className="rounded-full border border-white/20 bg-black/50 px-5 py-2 text-xs font-medium text-white/70 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
              >
                Stop
              </button>
              </div>
            </div>
          </div>
        </>
      )}

      {status === 'requesting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <p className="font-mono text-sm text-white/60">
            Initializing camera…
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-6">
          <p className="text-center text-sm text-red-300">{error}</p>
          <button
            onClick={() => setPhase('start')}
            className="rounded-full bg-white/10 px-6 py-2 text-sm text-white transition hover:bg-white/20"
          >
            Back
          </button>
        </div>
      )}
    </div>
  )
}

export default App
