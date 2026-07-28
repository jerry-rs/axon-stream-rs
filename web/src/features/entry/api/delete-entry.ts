import { apiClient } from "@/lib/api-client"

export function deleteEntry(fullPath: string): Promise<void> {
  return apiClient.delete(`/api/entry/delete/${fullPath}`)
}
