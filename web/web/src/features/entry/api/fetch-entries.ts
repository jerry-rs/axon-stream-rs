import { apiClient } from "@/lib/api-client"
import type { ListItem } from "@/features/entry/types"

export function fetchEntries(currentPath: string): Promise<ListItem[]> {
  const cleanPath = currentPath.replace(/^\/+/, "")
  return apiClient.get<ListItem[]>(`/api/entry/list/${cleanPath}`)
}
