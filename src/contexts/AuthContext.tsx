"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { listenAppDataChanged } from "@/lib/app-events";
import { User } from "@/types";

/* =========================
   TYPES
========================= */

interface LoginOptions {
  /** Where to redirect after successful login. Defaults to /dashboard. */
  redirectTo?: string;
}

interface LogoutOptions {
  /** Where to redirect after logout. Defaults to /login. */
  redirectTo?: string;
  /** Skip the API call. Useful when the session is already known to be dead. */
  silent?: boolean;
}

interface LoginResult {
  requiresTwoFactor: boolean;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
    options?: LoginOptions,
  ) => Promise<LoginResult>;
  verifyTwoFactor: (email: string, otp: string) => Promise<void>;
  logout: (options?: LogoutOptions) => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function normalizeAuthUser(user: User | null): User | null {
  if (!user) return null;
  const rawUser = user as User & { _id?: string };

  if (typeof document !== "undefined") {
    document.documentElement.lang = user.workspacePreferences?.language ?? "en";
    document.documentElement.dataset.timeFormat =
      user.workspacePreferences?.timeFormat ?? "12";
  }

  return {
    ...user,
    id: user.id ?? rawUser._id ?? "",
    storageUsed: user.storage?.usedBytes ?? user.storageUsed ?? 0,
    storageQuota: user.storage?.quotaBytes ?? user.storageQuota ?? 0,
  };
}

/* =========================
   PROVIDER
========================= */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const initialized = useRef(false);
  const mountedRef = useRef(true);

  // De-dupe concurrent refreshUser calls so multiple components mounting
  // at the same time don't trigger N parallel `/auth/me` requests.
  const refreshInFlight = useRef<Promise<User | null> | null>(null);

  /* =========================
     REFRESH USER
  ========================= */
  const refreshUser = useCallback(async (): Promise<User | null> => {
    if (refreshInFlight.current) return refreshInFlight.current;

    const promise = (async () => {
      try {
        const res = await authApi.me();
        const userData = normalizeAuthUser((res.data?.data as User | undefined) ?? null);
        if (mountedRef.current) setUser(userData);
        return userData;
      } catch {
        if (mountedRef.current) setUser(null);
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();

    refreshInFlight.current = promise;
    return promise;
  }, []);

  /* =========================
     INITIAL SESSION CHECK
  ========================= */
  useEffect(() => {
    // Always reset on each mount so state updates work after remounts
    // (React Strict Mode unmounts+remounts in dev).
    mountedRef.current = true;

    if (!initialized.current) {
      initialized.current = true;
      (async () => {
        try {
          await refreshUser();
        } finally {
          if (mountedRef.current) setIsLoading(false);
        }
      })();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [refreshUser]);

  useEffect(() => {
    return listenAppDataChanged((detail) => {
      if (detail.storage || detail.files || detail.folders) void refreshUser();
    });
  }, [refreshUser]);

  /* =========================
     LOGIN
  ========================= */
  const login = useCallback(
    async (
      email: string,
      password: string,
      options: LoginOptions = {},
    ): Promise<LoginResult> => {
      setIsAuthenticating(true);
      try {
        const response = await authApi.login(email, password);
        const data = response.data?.data as LoginResult | undefined;
        if (data?.requiresTwoFactor) {
          return { requiresTwoFactor: true, email: data.email ?? email };
        }
        const u = await refreshUser();
        if (!u) {
          throw new Error("Could not load your account after sign-in");
        }
        router.replace(options.redirectTo ?? "/dashboard");
        return { requiresTwoFactor: false };
      } finally {
        if (mountedRef.current) setIsAuthenticating(false);
      }
    },
    [refreshUser, router],
  );

  const verifyTwoFactor = useCallback(
    async (email: string, otp: string): Promise<void> => {
      setIsAuthenticating(true);
      try {
        await authApi.verifyTwoFactorLogin(email, otp);
        const u = await refreshUser();
        if (!u) throw new Error("Could not load your account after sign-in");
        router.replace("/dashboard");
      } finally {
        if (mountedRef.current) setIsAuthenticating(false);
      }
    },
    [refreshUser, router],
  );

  /* =========================
     LOGOUT
  ========================= */
  const logout = useCallback(
    async (options: LogoutOptions = {}): Promise<void> => {
      const { redirectTo = "/", silent = false } = options;

      // Clear UI immediately — don't wait on the network for the user
      // to feel "logged out". Avoids the dashboard flashing stale data
      // during the API roundtrip.
      if (mountedRef.current) setUser(null);

      if (!silent) {
        try {
          await authApi.logout();
        } catch (err) {
          // Logout API can fail for many reasons (expired session,
          // network blip, server issue). Don't surface this to the user —
          // their intent was to log out, and locally they already are.
          console.warn("[Auth] logout API call failed:", err);
        }
      }

      router.replace(redirectTo);
    },
    [router],
  );

  /* =========================
     DERIVED + MEMO
  ========================= */
  const isAuthenticated = user !== null;

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isLoading,
      isAuthenticating,
      isAuthenticated,
      login,
      verifyTwoFactor,
      logout,
      refreshUser,
    }),
    [
      user,
      isLoading,
      isAuthenticating,
      isAuthenticated,
      login,
      verifyTwoFactor,
      logout,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* =========================
   HOOK
========================= */

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
