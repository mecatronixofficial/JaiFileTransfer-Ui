"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { listenAppDataChanged } from "@/lib/app-events";

function UserQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: false },
      mutations: { retry: false },
    },
  }));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = listenAppDataChanged((detail) => {
      if (!detail.storage && !detail.files && !detail.folders) return;
      clearTimeout(timer);
      // Coalesce completion events from multi-file uploads into one refresh.
      timer = setTimeout(() => {
        void client.invalidateQueries({ queryKey: ["storage"] });
      }, 250);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
      client.clear();
    };
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Each account gets an isolated cache, including logout and account switching.
  return <UserQueryProvider key={user?.id ?? user?._id ?? "guest"}>{children}</UserQueryProvider>;
}
