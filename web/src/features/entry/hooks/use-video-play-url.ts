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
    // 签名有效期 600s，缓存的 URL 可能临近过期，每次打开播放器都重新签名
    refetchOnMount: "always",
    // 播放期间禁止后台 refetch：新签名改变 <video> src 会导致进度归零，
    // 续签由 EntryVideo 在到期前主动触发并恢复进度
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
