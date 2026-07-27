import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraSwitcher } from './components/CameraSwitcher'
import { CameraFeed } from './components/CameraFeed'
import { FSDOverlay } from './components/FSDOverlay'
import { SpeedHUD } from './components/SpeedHUD'
import { StartScreen } from './components/StartScreen'
import { TurnHUD } from './components/TurnHUD'
import { createPathEngine } from './engines'
import { useCamera } from './hooks/useCamera'
import { usePathLoop } from './hooks/usePathLoop'

type AppPhase = 'start' | 'driving'

function App() {
  const [phase, setPhase] = useState<AppPhase>('start')
  const engineRef = useRef(createPathEngine('demo'))
  const [engineReady, setEngineReady] = useState(false)

  const {
    videoRef,
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
  const pathState = usePathLoop(
    engineReady ? engineRef.current : null,
    active,
  )

  useEffect(() => {
    engineRef.current.init().then(() => setEngineReady(true))
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

  if (phase === 'start') {
    return (
      <StartScreen
        onStart={handleStart}
        loading={status === 'requesting'}
        error={error}
      />
    )
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <CameraFeed ref={videoRef} mirrored={isMirrored} className="absolute inset-0" />

      {status === 'active' && (
        <>
          <FSDOverlay pathState={pathState} />

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

            <div className="pointer-events-auto flex items-center justify-center gap-3">
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
