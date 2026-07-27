import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'error'

export interface CameraDevice {
  deviceId: string
  label: string
}

interface UseCameraResult {
  videoRef: (node: HTMLVideoElement | null) => void
  stream: MediaStream | null
  status: CameraStatus
  error: string | null
  isMirrored: boolean
  devices: CameraDevice[]
  activeDeviceId: string | null
  start: () => Promise<boolean>
  switchCamera: (deviceId: string) => Promise<boolean>
  stop: () => void
}

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function isMirroredStream(stream: MediaStream | null): boolean {
  const track = stream?.getVideoTracks()[0]
  if (!track) return false
  const { facingMode } = track.getSettings()
  if (facingMode === 'user') return true
  if (facingMode === 'environment') return false
  const label = track.label.toLowerCase()
  return label.includes('front') || label.includes('facetime') || label.includes('selfie')
}

async function enumerateCameras(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((d) => d.kind === 'videoinput' && d.deviceId)
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${i + 1}`,
    }))
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [isMirrored, setIsMirrored] = useState(false)

  const attachStream = useCallback((mediaStream: MediaStream) => {
    streamRef.current = mediaStream
    setStream(mediaStream)
    setIsMirrored(isMirroredStream(mediaStream))

    const track = mediaStream.getVideoTracks()[0]
    const deviceId = track?.getSettings().deviceId
    if (deviceId) setActiveDeviceId(deviceId)

    const video = videoRef.current
    if (video) {
      video.srcObject = mediaStream
      void video.play().catch(() => {})
    }
  }, [])

  const refreshDevices = useCallback(async () => {
    const cameras = await enumerateCameras()
    setDevices(cameras)
    return cameras
  }, [])

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const stop = useCallback(() => {
    stopTracks()
    setActiveDeviceId(null)
    setStatus('idle')
  }, [stopTracks])

  const openCamera = useCallback(
    async (deviceId?: string): Promise<boolean> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera API is not supported in this browser.')
        setStatus('error')
        return false
      }

      setStatus('requesting')
      setError(null)

      try {
        const mobile = isMobileDevice()
        const videoConstraints: MediaTrackConstraints = deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : {
              facingMode: mobile ? 'environment' : 'user',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })

        attachStream(mediaStream)
        await refreshDevices()
        setStatus('active')
        return true
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access and try again.'
            : err instanceof Error
              ? err.message
              : 'Failed to access camera.'
        setError(message)
        setStatus('error')
        return false
      }
    },
    [attachStream, refreshDevices],
  )

  const start = useCallback(() => openCamera(), [openCamera])

  const switchCamera = useCallback(
    async (deviceId: string): Promise<boolean> => {
      if (deviceId === activeDeviceId) return true
      stopTracks()
      return openCamera(deviceId)
    },
    [activeDeviceId, openCamera, stopTracks],
  )

  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node
      if (node && streamRef.current) {
        node.srcObject = streamRef.current
        void node.play().catch(() => {})
      }
    },
    [],
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    video.srcObject = stream
    void video.play().catch(() => {})
  }, [stream])

  useEffect(() => {
    const handleTrackEnded = () => {
      setError('Camera was disconnected.')
      setStatus('error')
      stop()
    }

    const tracks = streamRef.current?.getVideoTracks() ?? []
    tracks.forEach((track) => track.addEventListener('ended', handleTrackEnded))

    return () => {
      tracks.forEach((track) =>
        track.removeEventListener('ended', handleTrackEnded),
      )
    }
  }, [stream, stop])

  useEffect(() => {
    const handleDeviceChange = () => {
      void refreshDevices()
    }
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange)
    return () =>
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange)
  }, [refreshDevices])

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) return
      const tracks = streamRef.current?.getVideoTracks() ?? []
      const allEnded =
        tracks.length > 0 && tracks.every((t) => t.readyState === 'ended')
      if (allEnded) {
        setError('Camera session ended.')
        setStatus('error')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    return () => stop()
  }, [stop])

  return {
    videoRef: setVideoRef,
    stream,
    status,
    error,
    isMirrored,
    devices,
    activeDeviceId,
    start,
    switchCamera,
    stop,
  }
}
