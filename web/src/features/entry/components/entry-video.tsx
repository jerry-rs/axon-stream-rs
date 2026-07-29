import { useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { BASE_URL } from "@/lib/api-client";
import { useVideoPlayUrl } from "@/features/entry/hooks/use-video-play-url";

interface EntryVideoProps {
  /** 待播放视频的完整相对路径；null 表示关闭 */
  path: string | null;
  onClose: () => void;
}

/**
 * 视频播放弹窗：
 * 先用带 token 的请求换取 600s 签名播放地址，再交给 <video> 直接播放
 * （/api/video/stream 是签名校验的公开路由，video 标签无需带 Authorization）。
 * 点击遮罩或按 Escape 关闭。
 */
export function EntryVideo({ path, onClose }: EntryVideoProps) {
  const { data: playUrl, isPending, error } = useVideoPlayUrl(path);

  useEffect(() => {
    if (path === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [path, onClose]);

  if (path === null) {
    return null;
  }

  const name = path.split("/").pop() ?? path;
  const src = playUrl ? `${BASE_URL}/api/video/stream/${playUrl}` : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-5xl overflow-hidden rounded-lg border shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b px-4 py-2">
          <span className="truncate text-sm font-medium" title={name}>
            {name}
          </span>
          <button
            type="button"
            title="Close"
            className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-48 items-center justify-center bg-black">
          {isPending && (
            <Loader2 className="text-muted-foreground size-8 animate-spin" />
          )}
          {!isPending && error && (
            <p className="text-destructive p-8 text-sm">{error.message}</p>
          )}
          {src && (
            <video src={src} controls className="max-h-[75vh] w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
