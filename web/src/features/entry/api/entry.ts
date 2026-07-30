import { api } from "@/lib/api-client";
import { encodeEntryPath } from "@/features/entry/utils/path";
import {
  downloadFile,
  type DownloadOptions,
  type DownloadOutcome,
} from "./download";
import { uploadFile, type UploadOptions, type UploadResult } from "./upload";

/**
 * 与后端 ListItem (camelCase) 对应。
 * entryType: d=目录, f=文件, l=符号链接, u=未知；时间为 Unix 秒。
 */
export interface EntryItem {
  name: string;
  ext: string;
  entryType: "d" | "f" | "l" | "u";
  size: number;
  created: number;
  modified: number;
  accessed: number;
}

/**
 * 请求 /api/entry/list/{*currentPath}。
 * 根目录时 currentPath 为空串，URL 恰好是带尾斜杠的 /api/entry/list/。
 * 后端 ListResponse 为 serde(transparent)，data 直接是 EntryItem[]。
 */
export function getEntries(currentPath: string): Promise<EntryItem[]> {
  return api.get<EntryItem[]>(`/api/entry/list/${encodeEntryPath(currentPath)}`);
}

/**
 * 上传文件到 currentPath 目录：分片并行上传（默认 8 MiB/片、4 并发）。
 * 中断后 24h 内重新选择同一文件自动断点续传；
 * 服务端已有同名同大小文件时秒传，同名不同大小报 409。
 */
export function uploadEntry(
  currentPath: string,
  file: File,
  options?: UploadOptions,
): Promise<UploadResult> {
  return uploadFile(currentPath, file, options);
}

/** 删除文件或目录：DELETE /api/entry/delete/{*path} */
export function deleteEntry(path: string): Promise<unknown> {
  return api.delete(`/api/entry/delete/${encodeEntryPath(path)}`);
}

/**
 * 获取视频签名播放地址：GET /api/video/get-play-url/{*path}。
 * data 为相对签名路径（{path}?expire&sign&uid），
 * 拼接到 /api/video/stream/ 后作为播放源，有效期 600s。
 */
export function getVideoPlayUrl(path: string): Promise<string> {
  return api.get<string>(`/api/video/get-play-url/${encodeEntryPath(path)}`);
}

/**
 * 获取签名图片地址：GET /api/image/get-url/{*path}。
 * data 为相对签名路径（{path}?expire&sign&uid），
 * 拼接到 /api/image/stream/ 后作为 <img> 源，有效期 600s。
 */
export function getImageUrl(path: string): Promise<string> {
  return api.get<string>(`/api/image/get-url/${encodeEntryPath(path)}`);
}

/**
 * 获取签名下载地址：GET /api/entry/get-download-url/{*path}。
 * data 为相对签名路径（{path}?expire&sign&uid），
 * 拼接到 /api/entry/download/ 后作为下载源，有效期 600s。
 */
export function getDownloadUrl(path: string): Promise<string> {
  return api.get<string>(`/api/entry/get-download-url/${encodeEntryPath(path)}`);
}

/**
 * 下载文件或目录：先换取签名地址，再从公开路由
 * /api/entry/download/{*path} 下载，大文件自动分段并行；
 * 长下载签名过期时分块请求自动重新签名。
 * 返回 "cancelled" 表示用户在「另存为」选择框主动取消。
 */
export function downloadEntry(
  path: string,
  options?: DownloadOptions,
): Promise<DownloadOutcome> {
  return downloadFile(
    () =>
      getDownloadUrl(path).then((signed) => `/api/entry/download/${signed}`),
    options,
  );
}
