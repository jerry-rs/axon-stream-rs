import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteEntry } from "@/features/entry/api/entry";

export function useDeleteEntry(currentPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      deleteEntry(currentPath ? `${currentPath}/${name}` : name),
    // 删除成功后刷新当前目录列表
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["entries", currentPath] }),
  });
}
