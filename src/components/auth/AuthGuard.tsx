"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui";

/* =========================
   CONSTANTS
========================= */

const PUBLIC_ROUTES = new Set<string>([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

const DEFAULT_AUTH_ROUTE = "/dashboard";

/* =========================
   HELPERS
========================= */

function getSafeRedirect(param: string | null): string {
  if (!param) return DEFAULT_AUTH_ROUTE;
  if (!param.startsWith("/") || param.startsWith("//")) return DEFAULT_AUTH_ROUTE;
  const pathOnly = param.split("?")[0].split("#")[0];
  if (PUBLIC_ROUTES.has(pathOnly)) return DEFAULT_AUTH_ROUTE;
  return param;
}

function isPathPublic(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  for (const route of PUBLIC_ROUTES) {
    if (pathname.startsWith(`${route}/`)) return true;
  }
  return false;
}

/* =========================
   AUTH GUARD
========================= */

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  const redirectingRef = useRef(false);
  const isPublicRoute = useMemo(() => isPathPublic(pathname), [pathname]);
  const redirectPath = useMemo(
    () => {
      if (typeof window === "undefined") return DEFAULT_AUTH_ROUTE;
      return getSafeRedirect(new URLSearchParams(window.location.search).get("redirect"));
    },
    [pathname],
  );

  useEffect(() => {
    redirectingRef.current = false;
  }, [pathname]);

  useEffect(() => {
    if (isLoading || redirectingRef.current) return;

    if (!isAuthenticated && !isPublicRoute) {
      redirectingRef.current = true;
      router.replace("/");
      return;
    }

    if (isAuthenticated && isPublicRoute) {
      redirectingRef.current = true;
      router.replace(redirectPath);
      return;
    }
  }, [isAuthenticated, isLoading, isPublicRoute, pathname, redirectPath, router]);

  const shouldBlock =
    isLoading ||
    (!isAuthenticated && !isPublicRoute) ||
    (isAuthenticated && isPublicRoute);

  if (shouldBlock) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  return <>{children}</>;
}
