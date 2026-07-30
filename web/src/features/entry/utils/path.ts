/**
 * 将相对路径逐段 percent-encode 后拼接（保留 '/' 层级结构）。
 * 文件名可能含 '#'、'?'、'%'、空格或非 ASCII 字符，
 * 直接拼进 URL 会被当作 fragment/query 截断或被错误二次解码；
 * 服务端 Path 提取器 percent-decode 后还原为原始路径。
 */
export function encodeEntryPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
