import { Navigate, Outlet, useLocation } from "react-router";
import { useAuthContext } from "@/contexts/auth-context";

export function AuthGuard() {
  const { isAuthenticated } = useAuthContext();
  const location = useLocation();

  if (!isAuthenticated) {
    // 把当前路径通过 state 传过去，登录后可以跳回来
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
