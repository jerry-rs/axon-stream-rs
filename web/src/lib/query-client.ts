import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // 写操作（如登录）默认不重试，避免重复提交
      retry: false,
    },
  },
});
