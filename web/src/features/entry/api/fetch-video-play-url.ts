import { apiClient } from "@/lib/api-client"

export function fetchVideoPlayUrl(path: string, signal?: AbortSignal): Promise<string> {
  const cleanPath = path.replace(/^\/+/, "")
  return apiClient.get<string>(`/api/video/get-play-url/${cleanPath}`, { signal })
}
