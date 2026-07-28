import { useNavigate } from "react-router";
import { LoginForm } from "../components/login-form";
import { useLogin } from "../hooks/use-auth";

export function LoginPage() {
  const navigate = useNavigate();
  const loginMutation = useLogin();

  const handleLogin = (username: string, password: string) => {
    loginMutation.mutate(
      { username, password },
      {
        onSuccess: () => {
          navigate("/", { replace: true });
        },
      },
    );
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <LoginForm
        onSubmit={handleLogin}
        isLoading={loginMutation.isPending}
        error={loginMutation.error?.message}
      />
    </div>
  );
}
