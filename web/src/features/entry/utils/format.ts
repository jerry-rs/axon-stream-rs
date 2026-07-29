import type { EntryItem } from "@/features/entry/api/entry";

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * 输出定宽 "NNNN UU"（数字 4 位右对齐 + 单位 2 位左对齐），
 * 用不换行空格补齐（普通空格会被 HTML 折叠），
 * 配合单元格 tabular-nums 保证整列视觉宽度一致。
 */
export function formatSize(size: number): string {
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const number =
    unit === 0 || value >= 10
      ? String(Math.round(value))
      : value.toFixed(1);
  return `${number.padStart(4, "\u00A0")} ${SIZE_UNITS[unit].padStart(2, "\u00A0")}`;
}

/**
 * 定宽格式 "YYYY-MM-DD HH:mm:ss"（恒定 19 字符，本地时间），
 * toLocaleString 的输出随 locale 和日期位数变化，不能保证宽度。
 */
export function formatTime(unixSecs: number): string {
  if (unixSecs === 0) return "-";
  const d = new Date(unixSecs * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date} ${time}`;
}

const ENTRY_TYPE_LABELS: Record<EntryItem["entryType"], string> = {
  d: "folder",
  f: "file",
  l: "symlink",
  u: "unknown",
};

export function entryTypeLabel(entryType: EntryItem["entryType"]): string {
  return ENTRY_TYPE_LABELS[entryType];
}

export function formatExt(ext: string): string {
  return ext || "-";
}
