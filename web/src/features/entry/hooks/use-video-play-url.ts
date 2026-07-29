import { useQuery } from "@tanstack/react-query";
import { getVideoPlayUrl } from "@/features/entry/api/entry";

/** 获取签名播放地址；path 为 null（播放器关闭）时不请求 */
export function useVideoPlayUrl(path: string | null) {
  return useQuery({
    queryKey: ["video-play-url", path],
    queryFn: () => {
      if (path === null) {
        throw new Error("unreachable: query disabled when path is null");
      }
      return getVideoPlayUrl(path);
    },
    enabled: path !== null,
    // 签名有效期 600s，不长期缓存，每次打开播放器重新签名
    staleTime: 0,
  });
}
