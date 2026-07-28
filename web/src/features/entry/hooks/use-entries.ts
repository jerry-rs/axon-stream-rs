import { useQuery } from "@tanstack/react-query"
import { fetchEntries } from "@/features/entry/api/fetch-entries"

export function useEntries(currentPath: string) {
  return useQuery({
    queryKey: ["entries", currentPath],
    queryFn: () => fetchEntries(currentPath),
    enabled: true,
  })
}
