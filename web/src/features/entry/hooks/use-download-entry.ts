import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { downloadEntry } from "@/features/entry/api/entry";
import { renderTransferProgress } from "@/features/entry/components/progress-toast";

interface DownloadVariables {
  name: string;
  toastId: string;
}

/** 每个 mutate 调用一个独立 toast id，并发下载互不干扰 */
let toastSeq = 0;

/**
 * 下载当前目录下的文件/子目录，进度通过 sonner toast 呈现：
 * 起 loading toast 后先经探测/「另存为」选择框阶段（显示 Preparing），
 * 拉流开始转为实时进度（目录 tar 流无总量，退化为已下载字节数）；
 * 用户取消选择框或中止时静默 dismiss，不打扰用户。
 */
export function useDownloadEntry(currentPath: string) {
  const mutation = useMutation({
    mutationFn: async ({ name, toastId }: DownloadVariables) => {
      toast.loading(name, {
        id: toastId,
        description: "Preparing download…",
      });
      return downloadEntry(currentPath ? `${currentPath}/${name}` : name, {
        onProgress: (downloaded, total) =>
          toast.loading(name, {
            id: toastId,
            description: renderTransferProgress(downloaded, total),
          }),
      });
    },
    onSuccess: (outcome, { name, toastId }) => {
      if (outcome === "cancelled") {
        toast.dismiss(toastId);
        return;
      }
      toast.success(name, {
        id: toastId,
        description: "Download complete",
      });
    },
    onError: (error, { name, toastId }) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.dismiss(toastId);
        return;
      }
      toast.error(name, {
        id: toastId,
        description: error.message,
      });
    },
  });

  return {
    ...mutation,
    mutate: (name: string) =>
      mutation.mutate({ name, toastId: `download-${(toastSeq += 1)}` }),
  };
}
