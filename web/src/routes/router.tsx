import { createBrowserRouter, Navigate } from "react-router";
import { AppLayout } from "@/layout/app-layout";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { LoginPage } from "@/features/auth/pages/login-page";
import { HomePage } from "@/features/home/pages/home-page";
import {RegisterPage} from "@/features/auth/pages/register-page.tsx";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [{ path: "/", element: <HomePage /> }],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
