import { api, ApiError } from "@/lib/api-client";

/** 并行上传的默认连接数 */
const DEFAULT_CONCURRENCY = 4;
/** 默认分片大小 8 MiB；后端允许范围 [1 MiB, 32 MiB] */
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
/** 单个分片失败后的最大重试次数 */
const MAX_CHUNK_RETRIES = 3;

export interface UploadOptions {
  /** 并行连接数，默认 4 */
  concurrency?: number;
  /** 分片大小（字节），默认 8 MiB，合法范围 [1 MiB, 32 MiB] */
  chunkSize?: number;
  /** 进度回调：已上传字节数（含断点续传的存量分片）/ 总字节数 */
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
  /** 中止信号；中止后服务端会话保留，重传同一文件可续传 */
  signal?: AbortSignal;
}

export interface UploadResult {
  /** 合并后的文件路径（相对 data_dir） */
  path: string;
  size: number;
  /** true 表示命中秒传（服务端已有同名同大小文件），未实际上传 */
  instant: boolean;
}

/** 与后端 InitUploadResponse (camelCase) 对应 */
interface InitUploadResponse {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  /** 服务端已落盘的分片序号，断点续传时跳过 */
  uploadedChunks: number[];
  completed: boolean;
}

/** 与后端 CompleteUploadResponse (camelCase) 对应 */
interface CompleteUploadResponse {
  path: string;
  size: number;
}

/**
 * 初始化/恢复上传会话：POST /api/entry/upload/init。
 * uploadId 由（目录 + 文件名 + 大小）确定性生成，
 * 刷新页面后重新选择同一文件即可找回会话、跳过已传分片。
 */
function initUpload(
  path: string,
  file: File,
  chunkSize: number,
): Promise<InitUploadResponse> {
  return api.post<InitUploadResponse>("/api/entry/upload/init", {
    path: path || undefined,
    filename: file.name,
    totalSize: file.size,
    chunkSize,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 分片并行上传文件到 path 目录。
 *
 * 流程：init 换取会话（拿到 uploadId 与已传分片列表）→
 * worker 池并行补传缺失分片（单片独立重试；404 说明会话被清理，
 * 重新 init 同步服务端进度后重放）→ complete 合并落盘。
 * 服务端已有同名同大小文件时 init 直接返回 completed，秒传结束。
 *
 * 中断恢复：会话在服务端保留 24h，期间用同一文件重新调用即可续传；
 * 主动取消会话可 DELETE /api/entry/upload/{uploadId}。
 */
export async function uploadFile(
  path: string,
  file: File,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    chunkSize = DEFAULT_CHUNK_SIZE,
    onProgress,
    signal,
  } = options;

  const session = await initUpload(path, file, chunkSize);

  // 秒传：服务端已有同名同大小文件
  if (session.completed) {
    onProgress?.(file.size, file.size);
    return {
      path: path ? `${path}/${file.name}` : file.name,
      size: file.size,
      instant: true,
    };
  }

  const totalChunks = session.totalChunks;
  const effectiveChunkSize = session.chunkSize;
  const chunkSizeAt = (index: number): number => {
    const start = index * effectiveChunkSize;
    return Math.min(effectiveChunkSize, file.size - start);
  };

  // 断点续传：服务端已落盘的分片直接跳过，进度从存量开始累计
  const done = new Array<boolean>(totalChunks).fill(false);
  for (const index of session.uploadedChunks) {
    if (index < totalChunks) {
      done[index] = true;
    }
  }
  let uploaded = 0;
  for (let index = 0; index < totalChunks; index += 1) {
    if (done[index]) {
      uploaded += chunkSizeAt(index);
    }
  }
  onProgress?.(uploaded, file.size);

  const sessionRef = { uploadId: session.uploadId };

  const pushChunk = async (index: number): Promise<void> => {
    const start = index * effectiveChunkSize;
    const blob = file.slice(start, start + chunkSizeAt(index));

    for (let attempt = 0; attempt < MAX_CHUNK_RETRIES; attempt += 1) {
      if (signal?.aborted) {
        throw new DOMException("Upload aborted", "AbortError");
      }
      try {
        await api.post(
          `/api/entry/upload/chunk/${sessionRef.uploadId}/${index}`,
          blob,
          { signal },
        );
        uploaded += blob.size;
        onProgress?.(uploaded, file.size);
        return;
      } catch (err) {
        if (signal?.aborted || attempt >= MAX_CHUNK_RETRIES - 1) {
          throw err;
        }
        // 会话过期/被清理：重新 init 同步服务端进度，当前分片已在服务端则跳过
        if (err instanceof ApiError && err.status === 404) {
          const renewed = await initUpload(path, file, effectiveChunkSize);
          sessionRef.uploadId = renewed.uploadId;
          if (renewed.uploadedChunks.includes(index)) {
            uploaded += blob.size;
            onProgress?.(uploaded, file.size);
            return;
          }
        }
        await sleep(500 * (attempt + 1));
      }
    }
  };

  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= totalChunks) {
        return;
      }
      if (done[index]) {
        continue;
      }
      await pushChunk(index);
      done[index] = true;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, totalChunks) }, () => worker()),
  );

  const completed = await api.post<CompleteUploadResponse>(
    `/api/entry/upload/complete/${sessionRef.uploadId}`,
  );
  return { path: completed.path, size: completed.size, instant: false };
}
