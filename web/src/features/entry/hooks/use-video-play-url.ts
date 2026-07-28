import { useQuery } from "@tanstack/react-query"
import { fetchVideoPlayUrl } from "@/features/entry/api/fetch-video-play-url"

export function useVideoPlayUrl(path: string) {
  return useQuery({
    queryKey: ["video-play-url", path],
    queryFn: ({ signal }) => fetchVideoPlayUrl(path, signal),
  })
}
