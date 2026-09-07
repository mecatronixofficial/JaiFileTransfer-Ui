"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import Sidebar from "./Sidebar";
import Header from "./Header";
import dynamic from "next/dynamic";
import { useStorageQuery } from "@/hooks/useStorageQuery";
import { useAuth } from "@/contexts/AuthContext";
const UploadModal = dynamic(() => import("@/components/modals/UploadModal"));
import { readStorageUsage } from "@/lib/storage";


/* =========================
   STORAGE CONTEXT
   Exposed so child pages can call refreshStorage() after any
   operation that changes the user's storage (upload, delete, etc.)
========================= */

interface StorageContextValue {
  storageUsed: number;
  storageQuota: number;
  storageLoading: boolean;
  refreshStorage: () => void;
}

const StorageContext = createContext<StorageContextValue | null>(null);

export function useStorage(): StorageContextValue {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error("useStorage must be used inside <DashboardLayout>");
  return ctx;
}

/* =========================
   LAYOUT
========================= */

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const storageQuery = useStorageQuery();
  const storageUsed = storageQuery.data?.used ?? readStorageUsage(user).used;
  const storageLoading = storageQuery.isLoading;
  const { refetch } = storageQuery;

  const [showUpload, setShowUpload]               = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const refreshStorage = useCallback(() => { void refetch(); }, [refetch]);

  /* ── Mobile sidebar: close on Escape ── */
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileSidebarOpen]);

  /* ── Mobile sidebar: lock body scroll while open ── */
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [mobileSidebarOpen]);

  return (
    <StorageContext.Provider
      value={{ storageUsed, storageQuota: 0, storageLoading, refreshStorage }}
    >
      <div className="flex h-screen overflow-hidden bg-(--bg)">

        {/* ── Mobile overlay (closes sidebar on backdrop click) ── */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
            aria-hidden="true"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <Sidebar
          storageUsed={storageUsed}
          storageLoading={storageLoading}
          onUpload={() => setShowUpload(true)}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Header
            onMobileSidebarOpen={() => setMobileSidebarOpen(true)}
            onUpload={() => setShowUpload(true)}
            storageUsed={storageUsed}
            storageLoading={storageLoading}
          />
          <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 lg:p-7">
            {children}
          </main>
        </div>

        {showUpload && <UploadModal
          open={showUpload}
          onClose={() => setShowUpload(false)}
          onUploadComplete={refreshStorage}
          transferMode
        />}
      </div>
    </StorageContext.Provider>
  );
}
