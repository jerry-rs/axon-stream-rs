import { useCallback, useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { BASE_URL } from "@/lib/api-client";
import { useVideoPlayUrl } from "@/features/entry/hooks/use-video-play-url";

/** 签名地址到期前的续签缓冲，留足余量对抗后台标签页定时器节流 */
const RENEW_AHEAD_MS = 60_000;
/** 播放中出错时的最大自动续签次数，防止坏文件导致 refetch 死循环 */
const MAX_ERROR_RECOVERIES = 2;

/** 从签名相对 URL（{path}?expire&sign&uid）解析 expire（unix 秒），失败返回 null */
function parseExpire(playUrl: string): number | null {
  const queryIndex = playUrl.indexOf("?");
  if (queryIndex < 0) {
    return null;
  }
  const raw = new URLSearchParams(playUrl.slice(queryIndex + 1)).get("expire");
  if (raw === null) {
    return null;
  }
  const expire = Number(raw);
  return Number.isFinite(expire) ? expire : null;
}

interface EntryVideoProps {
  /** 待播放视频的完整相对路径；null 表示关闭 */
  path: string | null;
  onClose: () => void;
}

/**
 * 视频播放弹窗：
 * 先用带 token 的请求换取 600s 签名播放地址，再交给 <video> 直接播放
 * （/api/video/stream 是签名校验的公开路由，video 标签无需带 Authorization）。
 * 签名按请求校验，长视频会播放到期：到期前主动续签并恢复播放进度，
 * 续签不及时导致的播放错误由 onError 兜底补救。点击遮罩或按 Escape 关闭。
 */
export function EntryVideo({ path, onClose }: EntryVideoProps) {
  const { data: playUrl, isPending, error, refetch } = useVideoPlayUrl(path);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** 换 src 后待恢复的播放位置与播放状态 */
  const pendingRestoreRef = useRef<{ time: number; playing: boolean } | null>(
    null,
  );
  const errorRecoveriesRef = useRef(0);

  // 被移出 DOM 的 <video> 不会自动停止，卸载前必须显式 pause 并清空 src，
  // 否则关闭弹窗后仍在后台发声/缓冲，直到被 GC。useCallback 固定回调身份，
  // 避免重渲染导致 ref 清理函数反复执行。
  const handleVideoRef = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (!element) {
      return;
    }
    element.defaultPlaybackRate = 1.25;
    element.playbackRate = 1.25;
    return () => {
      // 丢弃未消费的恢复状态：续签在飞行中关闭弹窗时，避免残留进度
      // 被下次打开（可能是另一个视频）的 loadedmetadata 错误 seek
      pendingRestoreRef.current = null;
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, []);

  /** 重新签名；playUrl 更新驱动 React 换 src，进度在 onLoadedMetadata 恢复 */
  const renewPlayUrl = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    pendingRestoreRef.current = {
      time: video.currentTime,
      playing: !video.paused,
    };
    await refetch();
  }, [refetch]);

  // 到期前主动续签；续签成功 playUrl 变化后本效果自动重新排期
  useEffect(() => {
    if (!playUrl) {
      return;
    }
    const expire = parseExpire(playUrl);
    if (expire === null) {
      return;
    }
    const delay = Math.max(expire * 1000 - Date.now() - RENEW_AHEAD_MS, 0);
    const timer = window.setTimeout(() => void renewPlayUrl(), delay);
    return () => window.clearTimeout(timer);
  }, [playUrl, renewPlayUrl]);

  const handleLoadedMetadata = useCallback(() => {
    errorRecoveriesRef.current = 0;
    const pending = pendingRestoreRef.current;
    const video = videoRef.current;
    if (!pending || !video) {
      return;
    }
    pendingRestoreRef.current = null;
    video.currentTime = pending.time;
    if (pending.playing) {
      void video.play();
    }
  }, []);

  // 兜底：定时器被后台节流等原因导致续签不及时、Range 请求 403 时当场补救
  const handleVideoError = useCallback(() => {
    if (errorRecoveriesRef.current >= MAX_ERROR_RECOVERIES) {
      return;
    }
    errorRecoveriesRef.current += 1;
    void renewPlayUrl();
  }, [renewPlayUrl]);

  // 切换视频时重置恢复/重试状态，不跨会话携带
  useEffect(() => {
    pendingRestoreRef.current = null;
    errorRecoveriesRef.current = 0;
  }, [path]);

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
            <video
              ref={handleVideoRef}
              src={src}
              controls
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleVideoError}
              className="max-h-[75vh] w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}
