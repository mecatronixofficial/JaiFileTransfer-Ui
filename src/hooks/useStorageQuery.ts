"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usersApi } from "@/lib/api";
import { readStorageUsage } from "@/lib/storage";

export function useStorageQuery() {
  const { user } = useAuth();
  const userId = user?.id ?? user?._id;
  return useQuery({
    queryKey: ["storage", userId],
    enabled: Boolean(userId),
    queryFn: async ({ signal }) => {
      const response = await usersApi.myStorage(signal);
      return readStorageUsage(response.data);
    },
  });
}
