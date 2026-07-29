import { useMutation } from "@tanstack/react-query";
import { downloadEntry } from "@/features/entry/api/entry";

export function useDownloadEntry(currentPath: string) {
  return useMutation({
    mutationFn: (name: string) =>
      downloadEntry(currentPath ? `${currentPath}/${name}` : name),
  });
}
