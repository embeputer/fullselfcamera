interface StartScreenProps {
  onStart: () => void
  loading?: boolean
  error?: string | null
  subtitle?: string
}

export function StartScreen({
  onStart,
  loading,
  error,
  subtitle,
}: StartScreenProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-black px-6 text-center">
      <div className="mb-8 max-w-sm">
        <div className="mb-4 text-5xl">🚗</div>
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-white">
          Full Self Camera
        </h1>
        <p className="text-sm leading-relaxed text-white/60">
          Tesla FSD-style driving overlay. See your predicted path, turn
          guidance, and speed recommendations in real time.
        </p>
      </div>

      {error && (
        <div className="mb-4 max-w-sm rounded-lg border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        onClick={onStart}
        disabled={loading}
        className="rounded-full bg-cyan-500 px-8 py-3 font-semibold text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (subtitle ?? 'Starting camera…') : 'Start Driving'}
      </button>

      <p className="mt-6 max-w-xs text-xs text-white/30">
        Requires camera permission. Works on mobile and desktop browsers.
      </p>
    </div>
  )
}
