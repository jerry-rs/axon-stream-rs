import type { EntryItem } from "@/features/entry/api/entry";

/** 视频扩展名集合（图标展示与可播放判定共用） */
export const VIDEO_EXTS: ReadonlySet<string> = new Set([
  "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "mpg", "mpeg",
  "rmvb", "ts", "m2ts",
]);

/** 是否为可播放的视频文件（普通文件 + 视频扩展名） */
export function isVideoEntry(item: EntryItem): boolean {
  if (item.entryType !== "f") {
    return false;
  }
  return VIDEO_EXTS.has(item.ext.toLowerCase().replace(/^\./, ""));
}

/** 图片扩展名集合（浏览器 <img> 可渲染的格式；heic/raw 等不在内） */
export const IMAGE_EXTS: ReadonlySet<string> = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif",
]);

/** 是否为可查看的图片文件（普通文件 + 图片扩展名） */
export function isImageEntry(item: EntryItem): boolean {
  if (item.entryType !== "f") {
    return false;
  }
  return IMAGE_EXTS.has(item.ext.toLowerCase().replace(/^\./, ""));
}
