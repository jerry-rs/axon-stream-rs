import { Navigate, useNavigate } from "react-router";
import { SignupForm } from "@/components/signup-form";
import type { SignupFormValues } from "@/components/signup-form";
import { useRegister } from "@/features/auth/hooks/use-register";
import { ApiError, isAuthenticated } from "@/lib/api-client";

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();

  // 已认证用户访问注册页时直接回首页
  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  function handleSubmit(values: SignupFormValues) {
    registerMutation.mutate(values, {
      onSuccess: () => navigate("/", { replace: true }),
    });
  }

  // ApiError 携带后端返回的 message；网络异常等兜底为通用文案
  const errorMessage = registerMutation.error
    ? registerMutation.error instanceof ApiError
      ? registerMutation.error.message
      : "网络异常，请稍后重试"
    : null;

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <SignupForm
        className="w-full max-w-sm"
        onSubmit={handleSubmit}
        pending={registerMutation.isPending}
        error={errorMessage}
      />
    </div>
  );
}
