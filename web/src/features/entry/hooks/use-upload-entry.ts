import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { uploadEntry } from "@/features/entry/api/entry";
import {
  formatBytes,
  renderTransferProgress,
} from "@/features/entry/components/progress-toast";

/** 每个 mutate 调用一个独立 toast id，同文件名并发上传互不干扰 */
let toastSeq = 0;

interface UploadVariables {
  file: File;
  toastId: string;
}

/**
 * 分片上传当前目录的文件，进度通过 sonner toast 呈现：
 * mutationFn 入口起 loading toast，分片推进时同 id 原地刷新，
 * 完成转 success（秒传单独提示）、失败转 error（409 同名冲突等展示后端消息）。
 * toastId 随 mutation variables 传递，onSuccess/onError 据此更新同一 toast。
 */
export function useUploadEntry(currentPath: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ file, toastId }: UploadVariables) => {
      toast.loading(file.name, {
        id: toastId,
        description: renderTransferProgress(0, file.size),
      });
      return uploadEntry(currentPath, file, {
        onProgress: (uploaded, total) =>
          toast.loading(file.name, {
            id: toastId,
            description: renderTransferProgress(uploaded, total),
          }),
      });
    },
    onSuccess: (result, { file, toastId }) => {
      toast.success(file.name, {
        id: toastId,
        description: result.instant
          ? "Already on server — instant upload"
          : `Uploaded · ${formatBytes(result.size)}`,
      });
      void queryClient.invalidateQueries({
        queryKey: ["entries", currentPath],
      });
    },
    onError: (error, { file, toastId }) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.dismiss(toastId);
        return;
      }
      toast.error(file.name, {
        id: toastId,
        description: error.message,
      });
    },
  });

  return {
    ...mutation,
    mutate: (file: File) =>
      mutation.mutate({ file, toastId: `upload-${(toastSeq += 1)}` }),
  };
}
