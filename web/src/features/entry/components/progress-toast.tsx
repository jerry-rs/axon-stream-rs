import type { ReactNode } from "react";

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 紧凑字节格式 "8.0 MB"，用于 toast 描述（区别于表格里的定宽 formatSize） */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? bytes : value.toFixed(1)} ${SIZE_UNITS[unit]}`;
}

/**
 * 传输进度 toast 的描述内容（上传/下载共用）：
 * 已知总量显示进度条 + 百分比；total <= 0 表示总量未知
 * （目录 tar 流等无 Content-Length 的响应），退化为脉冲占位条 + 已传输字节数。
 */
export function renderTransferProgress(
  transferred: number,
  total: number,
): ReactNode {
  if (total <= 0) {
    return (
      <div className="mt-0.5 flex flex-col gap-1.5">
        <div className="bg-muted h-1 w-full animate-pulse rounded-full" />
        <span className="text-xs tabular-nums">{formatBytes(transferred)}</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((transferred / total) * 100));
  return (
    <div className="mt-0.5 flex flex-col gap-1.5">
      <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums">
        {pct}% · {formatBytes(transferred)} / {formatBytes(total)}
      </span>
    </div>
  );
}
