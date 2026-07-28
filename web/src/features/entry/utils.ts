export function formatSize(bytes: number): string {
  if (bytes === 0) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  if (i === 0) return `${bytes} ${units[i]}`
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}

export function formatTimestamp(ts: number): string {
  if (ts === 0) return "—"
  const d = new Date(ts * 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const VIDEO_EXTENSIONS = new Set([
  "mp4", "webm", "ogg", "mov", "avi", "mkv", "wmv",
  "flv", "m4v", "mpg", "mpeg", "3gp", "ts",
])

export function isVideo(ext: string): boolean {
  return VIDEO_EXTENSIONS.has(ext.toLowerCase())
}

export function resolveTypeLabel(type: string): string {
  switch (type) {
    case "d":
      return "folder"
    case "f":
      return "file"
    case "l":
      return "link"
    default:
      return "unknown"
  }
}
