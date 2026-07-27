import type { CameraDevice } from '../hooks/useCamera'

interface CameraSwitcherProps {
  devices: CameraDevice[]
  activeDeviceId: string | null
  onSwitch: (deviceId: string) => void
  disabled?: boolean
}

export function CameraSwitcher({
  devices,
  activeDeviceId,
  onSwitch,
  disabled,
}: CameraSwitcherProps) {
  if (devices.length <= 1) return null

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <label htmlFor="camera-select" className="sr-only">
        Select camera
      </label>
      <select
        id="camera-select"
        value={activeDeviceId ?? ''}
        onChange={(e) => onSwitch(e.target.value)}
        disabled={disabled}
        className="max-w-[10rem] truncate rounded-full border border-white/20 bg-black/50 px-3 py-2 text-xs text-white/80 backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus:ring-1 focus:ring-cyan-400 disabled:opacity-50 sm:max-w-[14rem]"
      >
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
    </div>
  )
}
