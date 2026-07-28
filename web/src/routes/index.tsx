import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { AuthGuard } from "@/components/auth-guard";
import { AppLayout } from "@/components/layouts/app-layout";

const LoginPage = lazy(() =>
  import("@/features/auth/pages/login-page").then((m) => ({ default: m.LoginPage }))
);
const HomePage = lazy(() =>
  import("@/features/home/pages/home-page").then((m) => ({ default: m.HomePage }))
);

const RegisterPage = lazy(() =>
  import("@/features/auth/pages/register-page").then((m) => ({ default:  m.RegisterPage}))
);

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LazyRoute><LoginPage /></LazyRoute>,
  },
  {
    path: "/register",
    element: <LazyRoute><RegisterPage /></LazyRoute>,
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: "/",
            element: <LazyRoute><HomePage /></LazyRoute>,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
