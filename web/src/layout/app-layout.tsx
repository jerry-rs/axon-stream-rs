import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import { AxonIcon } from "@/components/axon-icon";
import { Button } from "@/components/ui/button";
import { logout, onSessionExpired } from "@/lib/api-client";

/**
 * 认证后的应用壳：顶部导航 + 内容区，所有受保护页面共用。
 * 同时桥接 api-client 的会话过期事件，refresh token 失效时跳回登录页。
 */
export function AppLayout() {
  const navigate = useNavigate();

  useEffect(
    () => onSessionExpired(() => navigate("/login", { replace: true })),
    [navigate],
  );

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background/95 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <NavLink to="/">
            <span className="text-3xl leading-none font-bold tracking-tight select-none">
              {/*<Video className="mr-2 inline-block size-9 align-middle" />*/}
              <AxonIcon className="mr-2 inline-block size-9 align-middle" />
              Axon
            </span>
          </NavLink>

          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={handleLogout}
          >
            <LogOut />
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
