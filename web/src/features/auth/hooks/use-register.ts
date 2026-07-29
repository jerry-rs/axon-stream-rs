import { useMutation } from "@tanstack/react-query";
import { register } from "@/lib/api-client";
import type { AuthTokens } from "@/lib/api-client";

export interface RegisterVariables {
  username: string;
  password: string;
}

/**
 * 注册 mutation：成功后 api-client 已保存 token 并启动定时刷新，
 * 调用方在 onSuccess 中跳转即可。
 */
export function useRegister() {
  return useMutation<AuthTokens, Error, RegisterVariables>({
    mutationFn: ({ username, password }) => register(username, password),
  });
}
