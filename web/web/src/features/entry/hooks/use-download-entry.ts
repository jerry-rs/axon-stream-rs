import { useMutation } from "@tanstack/react-query"
import { downloadEntry } from "@/features/entry/api/download-entry"

export function useDownloadEntry() {
  return useMutation({
    mutationFn: (fullPath: string) => downloadEntry(fullPath),
  })
}
