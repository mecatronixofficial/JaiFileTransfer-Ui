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
import { usersApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import UploadModal from "@/components/modals/UploadModal";
import { readStorageUsage } from "@/lib/storage";
import { listenAppDataChanged } from "@/lib/app-events";

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
   CONSTANTS
========================= */

const DEFAULT_QUOTA = 10_737_418_240; // 10 GiB

/* =========================
   LAYOUT
========================= */

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? user?._id;

  const [storageUsed, setStorageUsed]             = useState(0);
  const [storageQuota, setStorageQuota]           = useState(DEFAULT_QUOTA);
  const [storageLoading, setStorageLoading]       = useState(true);
  const [showUpload, setShowUpload]               = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [refreshSeq, setRefreshSeq]               = useState(0);

  /* refreshStorage just increments a counter; the effect below does the work.
     This keeps it a plain () => void so the React Compiler doesn't flag it as
     "calling setState within an effect" at the call site. */
  const refreshStorage = useCallback(() => setRefreshSeq((n) => n + 1), []);

  useEffect(() => {
    return listenAppDataChanged((detail) => {
      if (detail.storage || detail.files || detail.folders) refreshStorage();
    });
  }, [refreshStorage]);

  /* ── Storage fetch ──
     The local async function lets the React Compiler trace that every
     setState call happens only after an `await`, satisfying its rule about
     not calling setState synchronously within an effect.
  ── */
  useEffect(() => {
    if (!userId) return;

    let alive = true;

    async function fetchStorage() {
      try {
        const res = await usersApi.myStorage();
        if (!alive) return;
        const storage = readStorageUsage(res.data, {
          used: readStorageUsage(user).used,
          quota: readStorageUsage(user).quota || DEFAULT_QUOTA,
        });
        setStorageUsed(storage.used);
        setStorageQuota(storage.quota);
      } catch {
        // silent — layout should never crash over storage
      } finally {
        if (alive) setStorageLoading(false);
      }
    }

    fetchStorage();
    return () => { alive = false; };
  }, [user, userId, refreshSeq]);

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
      value={{ storageUsed, storageQuota, storageLoading, refreshStorage }}
    >
      <div className="flex min-h-screen bg-(--bg)">

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
          storageQuota={storageQuota}
          storageLoading={storageLoading}
          onUpload={() => setShowUpload(true)}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            onMobileSidebarOpen={() => setMobileSidebarOpen(true)}
            onUpload={() => setShowUpload(true)}
            storageUsed={storageUsed}
            storageQuota={storageQuota}
            storageLoading={storageLoading}
          />
          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 lg:p-7">
            {children}
          </main>
        </div>

        <UploadModal
          open={showUpload}
          onClose={() => setShowUpload(false)}
          onUploadComplete={refreshStorage}
          transferMode
        />
      </div>
    </StorageContext.Provider>
  );
}
