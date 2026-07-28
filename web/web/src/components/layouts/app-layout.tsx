import { Outlet } from "react-router";
import { Nav } from "./nav";

export function AppLayout() {

  return (
    <div className="flex min-h-svh flex-col max-w-6xl mx-auto w-full gap-3">
      <div className="sticky top-0 z-50 border rounded-md overflow-hidden bg-background">
        <Nav />
      </div>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
