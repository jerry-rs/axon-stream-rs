import { useQuery } from "@tanstack/react-query";
import { getImageUrl } from "@/features/entry/api/entry";

/** 获取签名图片地址；path 为 null（查看器关闭）时不请求 */
export function useImageUrl(path: string | null) {
  return useQuery({
    queryKey: ["image-url", path],
    queryFn: () => {
      if (path === null) {
        throw new Error("unreachable: query disabled when path is null");
      }
      return getImageUrl(path);
    },
    enabled: path !== null,
    // 签名有效期 600s，不长期缓存，每次打开查看器重新签名
    staleTime: 0,
  });
}
