import { api } from "@/lib/api-client";
import { downloadFile, type DownloadOptions } from "./download";

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
  return api.get<EntryItem[]>(`/api/entry/list/${currentPath}`);
}

/**
 * 上传文件到 currentPath 目录：POST /api/entry/upload/{*currentPath}，
 * multipart 表单，字段名 file。
 */
export function uploadEntry(currentPath: string, file: File): Promise<unknown> {
  const formData = new FormData();
  formData.append("file", file);
  return api.post(`/api/entry/upload/${currentPath}`, formData);
}

/** 删除文件或目录：DELETE /api/entry/delete/{*path} */
export function deleteEntry(path: string): Promise<unknown> {
  return api.delete(`/api/entry/delete/${path}`);
}

/**
 * 获取视频签名播放地址：GET /api/video/get-play-url/{*path}。
 * data 为相对签名路径（{path}?expire&sign&uid），
 * 拼接到 /api/video/stream/ 后作为播放源，有效期 600s。
 */
export function getVideoPlayUrl(path: string): Promise<string> {
  return api.get<string>(`/api/video/get-play-url/${path}`);
}

/** 下载文件或目录：GET /api/entry/download/{*path}，大文件自动分段并行 */
export function downloadEntry(
  path: string,
  options?: DownloadOptions,
): Promise<void> {
  return downloadFile(`/api/entry/download/${path}`, options);
}
