import { useMutation } from "@tanstack/react-query";
import { login } from "@/lib/api-client";
import type { AuthTokens } from "@/lib/api-client";

export interface LoginVariables {
  username: string;
  password: string;
}

/**
 * 登录 mutation：成功后 api-client 已保存 token 并启动定时刷新，
 * 调用方在 onSuccess 中跳转即可。
 */
export function useLogin() {
  return useMutation<AuthTokens, Error, LoginVariables>({
    mutationFn: ({ username, password }) => login(username, password),
  });
}
