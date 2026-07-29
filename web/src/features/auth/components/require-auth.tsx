import { Navigate, Outlet, useLocation } from "react-router";
import { isAuthenticated } from "@/lib/api-client";

/**
 * 路由守卫：未认证访问受保护路由时跳转登录页，并记录来源路径以便登录后回跳。
 */
export function RequireAuth() {
  const location = useLocation();

  if (!isAuthenticated()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <Outlet />;
}
