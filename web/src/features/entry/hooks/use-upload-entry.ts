import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadEntry } from "@/features/entry/api/entry";

export function useUploadEntry(currentPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadEntry(currentPath, file),
    // 上传成功后刷新当前目录列表
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["entries", currentPath] }),
  });
}
