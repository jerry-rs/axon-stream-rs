import { useMutation } from "@tanstack/react-query";
import { authApi } from "../api/auth.api";
import { tokenStorage } from "@/lib/token-storage";
import { initTokenRefresh } from "@/lib/api-client";

export function useLogin() {
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      tokenStorage.setTokens(data.accessToken, data.refreshToken);
      initTokenRefresh();
      window.dispatchEvent(new CustomEvent("auth:login"));
    },
  });
}
