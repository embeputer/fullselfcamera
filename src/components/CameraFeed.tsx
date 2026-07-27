import { forwardRef } from 'react'

interface CameraFeedProps {
  mirrored?: boolean
  className?: string
}

export const CameraFeed = forwardRef<HTMLVideoElement, CameraFeedProps>(
  function CameraFeed({ mirrored = false, className = '' }, ref) {
    return (
      <video
        ref={ref}
        className={`h-full w-full object-cover ${className}`}
        style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
        playsInline
        muted
        autoPlay
      />
    )
  },
)
