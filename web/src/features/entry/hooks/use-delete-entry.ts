import { useMutation, useQueryClient } from "@tanstack/react-query"
import { deleteEntry } from "@/features/entry/api/delete-entry"
import { toast } from "@/components/ui/toast"

export function useDeleteEntry(currentPath: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (fullPath: string) => deleteEntry(fullPath),
    onSuccess: (_data, fullPath) => {
      toast.add({
        type: "success",
        title: "Deleted",
        description: `Succeeded to delete ${fullPath}`,
      })
      queryClient.invalidateQueries({ queryKey: ["entries", currentPath] })
    },
  })
}
