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

export function EntryVideo({ path, onClose }: EntryVideoProps) {
  const { data: playUrl, isLoading, isError, error } = useVideoPlayUrl(path)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

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
              onClick={(e) => e.preventDefault()} // 👈 阻止点击画面触发默认的“播放/暂停”
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.playbackRate = 1.25
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
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
