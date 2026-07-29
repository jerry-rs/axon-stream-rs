import { Navigate, useLocation, useNavigate } from "react-router";
import { LoginForm } from "@/features/auth/components/login-form";
import type { LoginFormValues } from "@/features/auth/components/login-form";
import { useLogin } from "@/features/auth/hooks/use-login";
import { ApiError, isAuthenticated } from "@/lib/api-client";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLogin();

  // 已认证用户访问登录页时直接回首页
  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const from =
    (location.state as { from?: string } | null)?.from ?? "/";

  function handleSubmit(values: LoginFormValues) {
    loginMutation.mutate(values, {
      onSuccess: () => navigate(from, { replace: true }),
    });
  }

  // ApiError 携带后端返回的 message；网络异常等兜底为通用文案
  const errorMessage = loginMutation.error
    ? loginMutation.error instanceof ApiError
      ? loginMutation.error.message
      : "网络异常，请稍后重试"
    : null;

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <LoginForm
        className="w-full max-w-sm"
        onSubmit={handleSubmit}
        pending={loginMutation.isPending}
        error={errorMessage}
      />
    </div>
  );
}
