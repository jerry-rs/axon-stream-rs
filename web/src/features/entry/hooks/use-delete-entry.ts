import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteEntry } from "@/features/entry/api/entry";

/**
 * 删除当前目录下的文件/子目录。
 * 删除是瞬时操作无进度，成功/失败各给一个 sonner toast 反馈，
 * 成功后刷新当前目录列表。
 */
export function useDeleteEntry(currentPath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      deleteEntry(currentPath ? `${currentPath}/${name}` : name),
    onSuccess: (_data, name) => {
      toast.success(name, { description: "Deleted" });
      void queryClient.invalidateQueries({
        queryKey: ["entries", currentPath],
      });
    },
    onError: (error, name) => {
      toast.error(name, { description: error.message });
    },
  });
}
