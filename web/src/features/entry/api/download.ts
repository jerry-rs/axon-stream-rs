import { ApiError, BASE_URL } from "@/lib/api-client";

/** 并行下载的默认连接数 */
const DEFAULT_CONCURRENCY = 6;
/** 默认分块大小 8 MiB；小于该值的文件直接单流内存下载 */
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
/** 单个分块失败后的最大重试次数 */
const MAX_CHUNK_RETRIES = 3;

export interface DownloadOptions {
  /** 并行连接数，默认 6 */
  concurrency?: number;
  /** 分块大小（字节），默认 8 MiB */
  chunkSize?: number;
  /** 进度回调：已下载字节数 / 总字节数（未知时为 -1） */
  onProgress?: (downloadedBytes: number, totalBytes: number) => void;
  /** 中止信号 */
  signal?: AbortSignal;
}

/**
 * 从 Content-Disposition 头解析文件名。
 * 优先 RFC 5987 的 filename*（charset'lang'percent-encoded，UTF-8 解码），
 * 回退 ASCII 降级版 filename（支持带引号及转义）。
 */
function resolveFilename(disposition: string | null): string | null {
  if (!disposition) {
    return null;
  }

  const extended = /filename\*\s*=\s*"?([^";]+)"?/i.exec(disposition);
  if (extended) {
    const value = extended[1].trim();
    // 跳过 charset'lang' 前缀；无前缀（非标准写法）则整体按编码值处理
    const secondQuote = value.indexOf("'", value.indexOf("'") + 1);
    const encoded = secondQuote >= 0 ? value.slice(secondQuote + 1) : value;
    try {
      return decodeURIComponent(encoded);
    } catch {
      // 百分号编码非法时继续尝试 filename
    }
  }

  const quoted = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i.exec(disposition);
  if (quoted) {
    return quoted[1].replace(/\\(.)/g, "$1");
  }

  const plain = /filename\s*=\s*([^;]+)/i.exec(disposition);
  return plain ? plain[1].trim() : null;
}

/**
 * 签名下载地址持有者：/api/entry/download 是签名校验的公开路由，
 * 地址有效期 600s，长下载中途过期时通过 refresh() 重新签名。
 */
interface SignedUrlRef {
  /** 当前有效的完整 API 路径（含签名 query） */
  value: string;
  /** 重新签名并更新 value */
  refresh: () => Promise<void>;
}

function triggerBrowserSave(blob: Blob, filename: string | null): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  if (filename) {
    anchor.download = filename;
  }
  anchor.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* File System Access API（流式落盘）                                     */
/* ------------------------------------------------------------------ */

// window.showSaveFilePicker 未收录进 lib.dom，自行收窄声明
type SaveFilePickerFn = (options?: {
  suggestedName?: string;
}) => Promise<FileSystemFileHandle>;

function getSaveFilePicker(): SaveFilePickerFn | null {
  const w = window as unknown as { showSaveFilePicker?: SaveFilePickerFn };
  return typeof w.showSaveFilePicker === "function"
    ? w.showSaveFilePicker.bind(window)
    : null;
}

/** 用户在选择框点取消的标记 */
const PICK_CANCELLED = Symbol("pick-cancelled");
type PickResult = FileSystemFileHandle | null | typeof PICK_CANCELLED;

/**
 * 弹「另存为」选择框让用户选落盘位置。
 * 返回 null 表示不可用/激活失效（调用方回退内存下载），
 * PICK_CANCELLED 表示用户主动取消（调用方放弃下载）。
 */
async function pickSaveTarget(suggestedName: string | null): Promise<PickResult> {
  const picker = getSaveFilePicker();
  if (!picker) {
    return null;
  }
  try {
    return await picker({ suggestedName: suggestedName ?? "download" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return PICK_CANCELLED;
    }
    // SecurityError（用户手势激活过期）等：回退内存下载
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 探测                                                                 */
/* ------------------------------------------------------------------ */

interface ProbeResult {
  /** 服务端是否支持 Range（返回 206 + Content-Range） */
  supportsRange: boolean;
  /** 资源总字节数；未知为 null */
  totalSize: number | null;
  filename: string | null;
}

/**
 * 用 Range: bytes=0-0 探测资源：
 * - 文件（ServeFile）返回 206 + Content-Range: bytes 0-0/{total}，可知总大小；
 * - 目录 tar 流等忽略 Range 的响应返回 200，判定为不支持分段。
 * 只读响应头，body 立即取消，不会拉取整个归档流。
 */
async function probeResource(
  path: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Range: "bytes=0-0" },
    signal,
  });

  // 空文件 Range 会返回 416，整体下载走单流兜底即可
  if (!res.ok && res.status !== 206 && res.status !== 416) {
    await res.body?.cancel().catch(() => undefined);
    throw new ApiError(
      `Download failed with status ${res.status}`,
      res.status,
      res.status,
    );
  }

  const filename = resolveFilename(res.headers.get("Content-Disposition"));

  let supportsRange = false;
  let totalSize: number | null = null;
  if (res.status === 206) {
    // Content-Range: bytes 0-0/12345
    const match = /\/(\d+)\s*$/.exec(res.headers.get("Content-Range") ?? "");
    if (match) {
      totalSize = Number(match[1]);
      supportsRange = true;
    }
  }

  await res.body?.cancel().catch(() => undefined);
  return { supportsRange, totalSize, filename };
}

/* ------------------------------------------------------------------ */
/* 分段并行核心：worker 池拉取分块，交给 sink 落地（内存数组或磁盘）          */
/* ------------------------------------------------------------------ */

interface ChunkTask {
  index: number;
  start: number;
  buffer: ArrayBuffer;
}

/**
 * 按 chunkSize 切分，concurrency 个 worker 共享任务队列并行拉取。
 * 每个分块独立重试；遇到 403（长下载中签名过期）重新签名再重放一次。
 * sink 决定落点：内存数组缓冲或直接按 offset 写盘。
 */
async function runChunkedDownload(
  url: SignedUrlRef,
  totalSize: number,
  options: Required<Pick<DownloadOptions, "concurrency" | "chunkSize">> &
    Pick<DownloadOptions, "onProgress" | "signal">,
  sink: (chunk: ChunkTask) => void | Promise<void>,
): Promise<void> {
  const { concurrency, chunkSize, onProgress, signal } = options;
  const totalChunks = Math.ceil(totalSize / chunkSize);
  let downloaded = 0;
  let nextIndex = 0;

  const fetchChunk = async (index: number): Promise<void> => {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, totalSize) - 1;

    for (let attempt = 0; attempt < MAX_CHUNK_RETRIES; attempt += 1) {
      try {
        const res = await fetch(`${BASE_URL}${url.value}`, {
          headers: { Range: `bytes=${start}-${end}` },
          signal,
        });

        // 签名在长时间下载中过期：重新签名后重放（不计入重试次数）
        if (res.status === 403 && attempt === 0) {
          await res.body?.cancel().catch(() => undefined);
          await url.refresh();
          attempt -= 1;
          continue;
        }

        if (res.status !== 206) {
          await res.body?.cancel().catch(() => undefined);
          throw new ApiError(
            `Chunk ${index} failed with status ${res.status}`,
            res.status,
            res.status,
          );
        }

        const buffer = await res.arrayBuffer();
        await sink({ index, start, buffer });
        downloaded += buffer.byteLength;
        onProgress?.(downloaded, totalSize);
        return;
      } catch (err) {
        if (signal?.aborted || attempt >= MAX_CHUNK_RETRIES - 1) {
          throw err;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 500 * (attempt + 1));
        });
      }
    }
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= totalChunks) {
        return;
      }
      await fetchChunk(index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, totalChunks) }, () => worker()),
  );
}

/* ------------------------------------------------------------------ */
/* 内存路径（回退）                                                       */
/* ------------------------------------------------------------------ */

/** 单流下载（兜底）：流式读取以回报进度，最后转 blob 保存 */
async function downloadWhole(
  path: string,
  filename: string | null,
  onProgress?: DownloadOptions["onProgress"],
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { signal });
  if (!res.ok) {
    throw new ApiError(
      `Download failed with status ${res.status}`,
      res.status,
      res.status,
    );
  }

  const total = Number(res.headers.get("Content-Length") ?? -1);
  const parts: Uint8Array[] = [];
  let downloaded = 0;

  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parts.push(value);
      downloaded += value.byteLength;
      onProgress?.(downloaded, total);
    }
  }

  triggerBrowserSave(new Blob(parts as BlobPart[]), filename);
}

/** 分段并行下载到内存，组装 Blob 后保存（峰值内存 = 文件大小） */
async function downloadChunkedToMemory(
  url: SignedUrlRef,
  totalSize: number,
  filename: string | null,
  options: Required<Pick<DownloadOptions, "concurrency" | "chunkSize">> &
    Pick<DownloadOptions, "onProgress" | "signal">,
): Promise<void> {
  const buffers = new Array<ArrayBuffer>(Math.ceil(totalSize / options.chunkSize));
  await runChunkedDownload(url, totalSize, options, ({ index, buffer }) => {
    buffers[index] = buffer;
  });
  triggerBrowserSave(new Blob(buffers), filename);
}

/* ------------------------------------------------------------------ */
/* 落盘路径（File System Access API）                                     */
/* ------------------------------------------------------------------ */

/** 单流写盘：目录 tar 流等不支持 Range 的响应 */
async function streamWholeToDisk(
  writable: FileSystemWritableFileStream,
  path: string,
  onProgress?: DownloadOptions["onProgress"],
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { signal });
  if (!res.ok) {
    throw new ApiError(
      `Download failed with status ${res.status}`,
      res.status,
      res.status,
    );
  }

  const total = Number(res.headers.get("Content-Length") ?? -1);
  let downloaded = 0;

  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      await writable.write(value);
      downloaded += value.byteLength;
      onProgress?.(downloaded, total);
    }
  }
}

/**
 * 下载到用户指定的文件句柄。
 * 返回 false 表示 createWritable 失败（调用方回退内存下载）；
 * 下载中途出错会 abort 丢弃半成品文件并抛错。
 */
async function tryDownloadToDisk(
  handle: FileSystemFileHandle,
  url: SignedUrlRef,
  /** 分段落盘时的总大小；null 表示单流落盘 */
  totalSize: number | null,
  options: Required<Pick<DownloadOptions, "concurrency" | "chunkSize">> &
    Pick<DownloadOptions, "onProgress" | "signal">,
): Promise<boolean> {
  let writable: FileSystemWritableFileStream;
  try {
    writable = await handle.createWritable();
  } catch {
    return false;
  }

  try {
    if (totalSize !== null) {
      // 分块按 offset 定位写入，内存占用仅为 并发数 × 分块大小
      await runChunkedDownload(url, totalSize, options, ({ start, buffer }) =>
        writable.write({ type: "write", position: start, data: buffer }),
      );
    } else {
      await streamWholeToDisk(
        writable,
        url.value,
        options.onProgress,
        options.signal,
      );
    }
    await writable.close();
    return true;
  } catch (err) {
    await writable.abort().catch(() => undefined);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* 入口                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 下载资源：urlProvider 换取 600s 签名地址（/api/entry/get-download-url），
 * 再从签名校验的公开路由 /api/entry/download 拉取，转 blob / 本地文件保存。
 * 下载接口返回二进制而非 JSON 信封，不能走 request()。
 * 文件名取自响应的 Content-Disposition 头。
 *
 * 下载策略（按优先级）：
 * 1. 浏览器支持 File System Access API：一律弹「另存为」选择框落盘。
 *    大文件分块按 offset 写盘（内存占用 = 并发数 × 分块大小），
 *    小文件/目录 tar 流单流写盘；completed 的时机 = 写盘真正结束，
 *    成功提示不会早于用户点 Save；
 * 2. API 不可用（如 Firefox）回退内存：支持 Range 的大文件分段并行拉取，
 *    组装 Blob 交浏览器下载（峰值内存 = 文件大小）；
 * 3. 其余（小文件、不支持 Range）：单流下载。
 *    回退路径的完成时机 = 字节移交浏览器，无法感知浏览器自身的保存对话框。
 */
/** 下载结果：completed 正常落地；cancelled 用户在「另存为」选择框主动取消 */
export type DownloadOutcome = "completed" | "cancelled";

export async function downloadFile(
  urlProvider: () => Promise<string>,
  options: DownloadOptions = {},
): Promise<DownloadOutcome> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    chunkSize = DEFAULT_CHUNK_SIZE,
    onProgress,
    signal,
  } = options;
  const chunkOptions = { concurrency, chunkSize, onProgress, signal };

  // 签名有效期 600s；分块请求拿到 403 时通过 refresh 重新签名续期
  const url: SignedUrlRef = {
    value: await urlProvider(),
    refresh: async () => {
      url.value = await urlProvider();
    },
  };

  const probe = await probeResource(url.value, signal);
  const totalSize = probe.totalSize;
  const canChunk =
    probe.supportsRange && totalSize !== null && totalSize > chunkSize;

  // 有 File System Access API 一律走选择框落盘，保证 completed 时机 = 写盘结束
  if (getSaveFilePicker() !== null) {
    const picked = await pickSaveTarget(probe.filename);
    if (picked === PICK_CANCELLED) {
      return "cancelled";
    }
    if (picked !== null) {
      const done = await tryDownloadToDisk(
        picked,
        url,
        canChunk ? totalSize : null,
        chunkOptions,
      );
      if (done) {
        return "completed";
      }
    }
  }

  if (canChunk) {
    await downloadChunkedToMemory(url, totalSize, probe.filename, chunkOptions);
    return "completed";
  }

  await downloadWhole(url.value, probe.filename, onProgress, signal);
  return "completed";
}
