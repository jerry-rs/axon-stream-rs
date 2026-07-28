import { apiClient } from "@/lib/api-client"

export function downloadEntry(fullPath: string) {
  return apiClient.download(`/api/entry/download/${fullPath}`)
}
