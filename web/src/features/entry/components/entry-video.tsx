import { useCallback, useEffect, useRef, useState } from "react"
import { useVideoPlayUrl } from "../hooks/use-video-play-url"

interface EntryVideoProps {
  path: string
  onClose: () => void
}

/**
 * Encode a URL path for use in a src attribute.
 * Encodes special characters like # (→ %23) in path segments
 * while preserving query string delimiters (? & =).
 */
function encodeSrcPath(playUrl: string): string {
  const queryIndex = playUrl.indexOf("?")
  const pathPart = queryIndex === -1 ? playUrl : playUrl.slice(0, queryIndex)
  const queryPart = queryIndex === -1 ? "" : playUrl.slice(queryIndex)

  // Encode each path segment individually so / stays literal
  const encodedPath = pathPart
    .split("/")
    .map(encodeURIComponent)
    .join("/")

  return encodedPath + queryPart
}

/** Extract the expire timestamp (in ms) from a signed play URL. */
function parseExpireMs(playUrl: string): number | null {
  try {
    const url = new URL(playUrl)
    const expire = url.searchParams.get("expire")
    if (expire) {
      const ts = parseInt(expire, 10)
      if (!Number.isNaN(ts)) return ts * 1000 // expire is typically in seconds
    }
  } catch {
    // playUrl may not be a fully qualified URL – ignore
  }
  return null
}

export function EntryVideo({ path, onClose }: EntryVideoProps) {
  const { data: playUrl, isLoading, isError, error, refetch } =
    useVideoPlayUrl(path)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // ---- URL-refresh state (kept in refs to avoid render churn) ----
  const savedPositionRef = useRef<number | null>(null)
  const shouldAutoPlayRef = useRef(false)
  const isRefreshingRef = useRef(false)
  const refreshGenerationRef = useRef(0)
  const errorRetryCountRef = useRef(0)

  // Reset retry count when we get a fresh URL
  useEffect(() => {
    errorRetryCountRef.current = 0
  }, [playUrl])

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // ------------------------------------------------------------------
  // Refresh the play URL
  // ------------------------------------------------------------------
  const refreshPlayUrl = useCallback(() => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true

    const gen = ++refreshGenerationRef.current

    const video = videoRef.current
    if (video && !video.ended) {
      savedPositionRef.current = video.currentTime
      shouldAutoPlayRef.current = !video.paused
    }

    refetch().finally(() => {
      // If the generation changed (another refresh started), this one is stale
      if (refreshGenerationRef.current === gen) {
        isRefreshingRef.current = false
      }
    })
  }, [refetch])

  // ------------------------------------------------------------------
  // After a URL refresh, resume playback from the saved position
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!playUrl || savedPositionRef.current === null) return
    const video = videoRef.current
    if (!video) return

    const pos = savedPositionRef.current
    const autoPlay = shouldAutoPlayRef.current
    savedPositionRef.current = null

    const resume = () => {
      video.currentTime = pos
      video.playbackRate = 1.25
      if (autoPlay) {
        video.play().catch(() => {})
      }
    }

    // If metadata is already loaded (e.g. cached video), resume immediately.
    // Otherwise wait for loadedmetadata to avoid a race where the event fires
    // before this effect runs.
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      resume()
    } else {
      const onReady = () => {
        resume()
        video.removeEventListener("loadedmetadata", onReady)
      }
      video.addEventListener("loadedmetadata", onReady)
      return () => video.removeEventListener("loadedmetadata", onReady)
    }
  }, [playUrl])

  // ------------------------------------------------------------------
  // Proactive refresh: re-fetch the URL 60s before it expires
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!playUrl) return
    const expireMs = parseExpireMs(playUrl)
    if (expireMs === null) return

    const REFRESH_BEFORE_MS = 60_000
    const delay = expireMs - Date.now() - REFRESH_BEFORE_MS

    if (delay <= 0) {
      // Already expired or about to expire — refresh immediately if still playing
      const video = videoRef.current
      if (video && !video.paused && !video.ended) {
        refreshPlayUrl()
      }
      return
    }

    const timer = setTimeout(() => {
      const video = videoRef.current
      if (video && !video.paused && !video.ended) {
        refreshPlayUrl()
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [playUrl, refreshPlayUrl])

  // ------------------------------------------------------------------
  // Reactive: handle video load errors (fallback for expired URL)
  // ------------------------------------------------------------------
  const handleVideoError = useCallback(() => {
    const MAX_ERROR_RETRIES = 3
    if (errorRetryCountRef.current >= MAX_ERROR_RETRIES) return
    // Don't waste a retry if a refresh is already in progress
    if (isRefreshingRef.current) return
    errorRetryCountRef.current++
    refreshPlayUrl()
  }, [refreshPlayUrl])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Video player"
    >
      <div className="relative max-h-[90vh] max-w-[90vw]">
        {isError ? (
          <ErrorDisplay message={(error as Error).message} />
        ) : isLoading || !playUrl ? (
          <LoadingDisplay />
        ) : (
          <figure className="relative flex flex-col items-center gap-2">
            <figcaption className="relative z-10 max-w-[90vw] truncate text-sm text-muted-foreground">
              {path.split("/").at(-1)}
            </figcaption>
            {isPlaying && (
              <video
                src={`/api/video/stream/${encodeSrcPath(playUrl)}`}
                className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-2xl opacity-40"
                muted
                playsInline
                aria-hidden="true"
              />
            )}
            <video
              ref={videoRef}
              key={playUrl}
              src={`/api/video/stream/${encodeSrcPath(playUrl)}`}
              controls
              muted
              className="relative z-10 max-h-[90vh] max-w-[90vw] rounded-lg"
              onClick={(e) => e.preventDefault()}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.playbackRate = 1.25
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={handleVideoError}
            />
          </figure>
        )}

        <button
          onClick={onClose}
          aria-label="Close video"
          className="absolute right-0 top-0 -translate-y-1/2 translate-x-1/2 flex size-8 items-center justify-center rounded-full bg-background text-foreground shadow-md hover:bg-muted"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function LoadingDisplay() {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg bg-background px-8 text-muted-foreground">
      Loading…
    </div>
  )
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg bg-background px-8 text-destructive">
      {message}
    </div>
  )
}
