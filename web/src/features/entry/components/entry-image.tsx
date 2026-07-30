import { useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { BASE_URL } from "@/lib/api-client";
import { useImageUrl } from "@/features/entry/hooks/use-image-url";

interface EntryImageProps {
  /** 待查看图片的完整相对路径；null 表示关闭 */
  path: string | null;
  onClose: () => void;
}

/**
 * 图片查看弹窗：
 * 先用带 token 的请求换取 600s 签名地址，再交给 <img> 直接加载
 * （/api/image/stream 是签名校验的公开路由，img 标签无需带 Authorization）。
 * 点击遮罩或按 Escape 关闭。
 */
export function EntryImage({ path, onClose }: EntryImageProps) {
  const { data: imageUrl, isPending, error } = useImageUrl(path);

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
  const src = imageUrl ? `${BASE_URL}/api/image/stream/${imageUrl}` : null;

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
            <img
              src={src}
              alt={name}
              className="max-h-[75vh] w-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
