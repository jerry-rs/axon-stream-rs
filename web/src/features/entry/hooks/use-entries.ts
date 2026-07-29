import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getEntries } from "@/features/entry/api/entry";

export function useEntries(currentPath: string) {
  return useQuery({
    queryKey: ["entries", currentPath],
    queryFn: () => getEntries(currentPath),
    // 切换目录时保留上一页数据，避免表格闪 loading
    placeholderData: keepPreviousData,
  });
}
