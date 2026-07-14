"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { adminApi, usersApi } from "@/lib/api";
import { User } from "@/types";
import { Avatar, Modal, Spinner } from "@/components/ui";
import { formatBytes, formatCompactNumber } from "@/lib/utils";
import {
  HardDrive, Image as ImageIcon, Video, FileText, Folder, RefreshCw,
  AlertTriangle, Users, Upload,
  Clock, Search, Save, ShieldCheck, DatabaseZap,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { handleApiError } from "@/lib/error-handler";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { showToast } from "@/lib/toast";
import { listenAppDataChanged } from "@/lib/app-events";

/* ─── Types ─── */
interface StorageBreakdown {
  images?: number;
  videos?: number;
  documents?: number;
  pdfs?: number;
  spreadsheets?: number;
  other?: number;
}

interface StorageData {
  totalUsedBytes?: number;
  totalQuotaBytes?: number;
  totalUsed?: number;
  totalStorage?: number;
  totalQuota?: number;
  totalAllocated?: number;
  summary?: {
    totalSizeBytes?: number;
    totalUsedBytes?: number;
    totalQuotaBytes?: number;
  };
  byCategory?: Array<{
    category?: string;
    totalSizeBytes?: number;
    totalSize?: number;
  }>;
  breakdown?: StorageBreakdown;
  fileTypeBreakdown?: StorageBreakdown;
  userCount?: number;
  fileCount?: number;
  [key: string]: unknown;
}

interface UploadSessionItem {
  id: string;
  _id?: string;
  fileName?: string;
  status?: string;
  size?: number;
  userId?: string;
  createdAt?: string;
  completedAt?: string | null;
}

type ApiUser = Partial<User> & {
  _id?: string;
  storage_used?: number;
  storage_quota?: number;
  storage?: { usedBytes?: number; quotaBytes?: number; fileCount?: number };
};

function normalizeUser(u: ApiUser): User {
  const storage = u.storage as
    | { usedBytes?: number; quotaBytes?: number; fileCount?: number }
    | undefined;

  return {
    id: String(u.id ?? u._id ?? ""),
    name: u.name ?? "",
    email: u.email ?? "",
    role: u.role ?? "user",
    isActive: u.isActive ?? true,
    storageUsed: storage?.usedBytes ?? u.storageUsed ?? u.storage_used ?? 0,
    storageQuota: storage?.quotaBytes ?? u.storageQuota ?? u.storage_quota ?? 0,
    department: u.department ?? null,
    phone: u.phone ?? null,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt ?? new Date().toISOString(),
    updatedAt: u.updatedAt ?? new Date().toISOString(),
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseUsers(data: any): User[] {
  const arr: ApiUser[] =
    Array.isArray(data?.users)       ? data.users       :
    Array.isArray(data?.data?.users) ? data.data.users  :
    Array.isArray(data?.data?.items) ? data.data.items  :
    Array.isArray(data?.items)       ? data.items       :
    Array.isArray(data?.data)        ? data.data        :
    Array.isArray(data)              ? data             : [];
  return arr.map(normalizeUser).filter((u) => u.id);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseStorageBreakdown(data: any): StorageBreakdown {
  const byCategory = data?.byCategory ?? data?.data?.byCategory ?? [];
  if (Array.isArray(byCategory)) {
    return byCategory.reduce((acc: StorageBreakdown, item: any) => {
      const key = item?.category;
      if (typeof key === "string") {
        acc[key as keyof StorageBreakdown] = item?.totalSizeBytes ?? item?.totalSize ?? 0;
      }
      return acc;
    }, {});
  }

  return data?.breakdown ?? data?.fileTypeBreakdown ?? {};
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ─── Mini chart bar ─── */
interface BarRowProps {
  label: string;
  value: number;
  total: number;
  color: string;
  icon: React.ReactNode;
}
function BarRow({ label, value, total, color, icon }: BarRowProps) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
          {icon} {label}
        </span>
        <span className="text-xs text-gray-500">
          {formatBytes(value)}{" "}
          <span className="text-gray-300 dark:text-zinc-600">·</span>{" "}
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
        <div
          className={`h-full origin-left rounded-full transition-transform duration-700 ${color}`}
          style={{ transform: `scaleX(${(pct / 100).toFixed(4)})` }}
        />
      </div>
    </div>
  );
}

/* ── Overview card skeleton ── */
function CardSkel() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 h-3 w-24 rounded bg-gray-100 dark:bg-zinc-800" />
      <div className="h-8 w-28 rounded bg-gray-100 dark:bg-zinc-800" />
      <div className="mt-2 h-3 w-20 rounded bg-gray-100 dark:bg-zinc-800" />
    </div>
  );
}

/* ════════════════════════════════════
   PAGE
════════════════════════════════════ */
export default function AdminStoragePage() {
  const { user: me } = useAuth();
  const router = useRouter();

  const role = me?.role?.toLowerCase();
  const isAdmin = role === "admin" || role === "superadmin";

  const [storageData, setStorageData] = useState<StorageData | null>(null);
  const [users,       setUsers]       = useState<User[]>([]);
  const [sessions,    setSessions]    = useState<UploadSessionItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadIssues,  setLoadIssues]  = useState<string[]>([]);
  const [search,      setSearch]      = useState("");
  const [syncingUser, setSyncingUser] = useState<string | null>(null);

  /* Quota modal */
  const [quotaUser,   setQuotaUser]   = useState<User | null>(null);
  const [quotaGB,     setQuotaGB]     = useState("10");
  const [savingQuota, setSavingQuota] = useState(false);

  useEffect(() => {
    if (me && !isAdmin) router.replace("/dashboard");
  }, [me, isAdmin, router]);

  const load = useCallback(async (silent = false) => {
    if (!isAdmin) return;
    if (!silent) setLoading(true);
    setLoadIssues([]);
    try {
      const [storRes, usersRes, sessRes] = await Promise.allSettled([
        adminApi.storage(),
        usersApi.storageUsage({ limit: 200 }),
        adminApi.uploadSessions({ limit: 20 }),
      ]);
      const issues: string[] = [];

      if (storRes.status === "fulfilled") {
        const d = storRes.value.data;
        setStorageData(d?.storage ?? d?.data ?? d ?? {});
      } else {
        issues.push("Storage summary failed");
      }
      if (usersRes.status === "fulfilled") {
        const d = usersRes.value.data?.data ?? usersRes.value.data;
        setUsers(parseUsers(d));
        setStorageData((prev) => ({ ...(prev ?? {}), ...(d?.summary ?? {}) }));
      } else {
        issues.push("User storage usage failed");
      }
      if (sessRes.status === "fulfilled") {
        const d = sessRes.value.data;
        const arr = d?.sessions ?? d?.data?.sessions ?? d?.data ?? d ?? [];
        setSessions(Array.isArray(arr) ? arr.slice(0, 20).map((session: UploadSessionItem) => ({
          ...session,
          id: String(session.id ?? session._id ?? `${session.fileName ?? "session"}:${session.createdAt ?? ""}`),
        })) : []);
      } else {
        issues.push("Upload sessions failed");
      }
      setLoadIssues(issues);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    return listenAppDataChanged((detail) => {
      if (detail.files || detail.folders || detail.storage) void load(true);
    });
  }, [load]);

  /* ─── Derived numbers ─── */
  const totalUsed  = storageData?.totalUsedBytes ?? storageData?.summary?.totalSizeBytes ?? storageData?.totalUsed  ?? storageData?.totalStorage ?? users.reduce((s, u) => s + (u.storageUsed  || 0), 0);
  const totalQuota = storageData?.totalQuotaBytes ?? storageData?.totalQuota ?? storageData?.totalAllocated ?? users.reduce((s, u) => s + (u.storageQuota || 0), 0);
  const usedPct    = totalQuota > 0 ? Math.min((totalUsed / totalQuota) * 100, 100) : 0;

  const breakdown: StorageBreakdown = parseStorageBreakdown(storageData);
  const breakdownTotal = Math.max(
    (Object.values(breakdown) as number[]).reduce((s, v) => s + (v || 0), 0),
    1,
  );

  const cats = useMemo(() => [
    { label: "Images",    value: breakdown.images    || 0, color: "bg-amber-500",   icon: <ImageIcon size={13} className="text-amber-500"  /> },
    { label: "Videos",    value: breakdown.videos    || 0, color: "bg-purple-500",  icon: <Video    size={13} className="text-purple-500" /> },
    { label: "Documents", value: breakdown.documents || 0, color: "bg-blue-500",    icon: <FileText size={13} className="text-blue-500"   /> },
    { label: "PDFs",      value: breakdown.pdfs      || 0, color: "bg-red-500",     icon: <FileText size={13} className="text-red-500"    /> },
    { label: "Sheets",    value: breakdown.spreadsheets || 0, color: "bg-emerald-500", icon: <FileText size={13} className="text-emerald-500" /> },
    { label: "Other",     value: breakdown.other     || 0, color: "bg-slate-400",   icon: <Folder   size={13} className="text-slate-400"  /> },
  ], [breakdown.documents, breakdown.images, breakdown.other, breakdown.pdfs, breakdown.spreadsheets, breakdown.videos]);

  const sortedUsers = useMemo(() => [...users].sort((a, b) => (b.storageUsed || 0) - (a.storageUsed || 0)), [users]);
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedUsers;
    return sortedUsers.filter((u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query));
  }, [search, sortedUsers]);

  const highUsageUsers = sortedUsers.filter((u) => u.storageQuota > 0 && (u.storageUsed / u.storageQuota) >= 0.8);

  const overviewColor = usedPct > 80 ? "text-red-500" : usedPct > 60 ? "text-amber-500" : "text-emerald-500";
  const barColor      = usedPct > 80 ? "bg-red-500"   : usedPct > 60 ? "bg-amber-500"   : "bg-orange-500";

  /* ─── Quota update ─── */
  async function handleQuotaSave(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!quotaUser) return;
    const bytes = parseFloat(quotaGB) * 1_073_741_824;
    if (isNaN(bytes) || bytes <= 0) return showToast.error("Enter a valid quota in GB");
    setSavingQuota(true);
    try {
      const { usersApi: ua } = await import("@/lib/api");
      await ua.updateQuota(quotaUser.id, bytes);
      showToast.success("Quota updated");
      setQuotaUser(null);
      load(true);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSavingQuota(false);
    }
  }

  async function handleSyncStorage(user: User) {
    setSyncingUser(user.id);
    try {
      const res = await usersApi.syncStorage(user.id);
      const storageUsed = Number(res.data?.data?.storageUsed ?? user.storageUsed);
      setUsers((current) => current.map((item) => (
        item.id === user.id ? { ...item, storageUsed } : item
      )));
      showToast.success("Storage synced");
      load(true);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSyncingUser(null);
    }
  }

  /* ─── Session status badge ─── */
  function sessionBadge(status?: string) {
    const map: Record<string, string> = {
      completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      uploading: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      failed:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      aborted:   "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400",
    };
    return map[status ?? ""] ?? "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400";
  }

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-6 pb-10">

          {/* ── Header ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-violet-500/15 to-purple-500/10 ring-1 ring-violet-400/30">
                <HardDrive size={18} className="text-violet-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Storage Manager</h1>
                <p className="text-xs text-gray-400 dark:text-gray-500">Live platform storage, quotas, upload sessions, and sync tools</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400 dark:hover:border-orange-700 dark:hover:text-orange-400"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {!loading && loadIssues.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/30 dark:bg-amber-950/20">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Some storage data could not be refreshed</p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{loadIssues.join(" · ")}</p>
              </div>
            </div>
          )}

          {/* ── High usage alerts ── */}
          {!loading && highUsageUsers.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/30 dark:bg-amber-950/20">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {highUsageUsers.length} user{highUsageUsers.length !== 1 ? "s" : ""} approaching storage limit
                </p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {highUsageUsers.slice(0, 3).map((u) => u.name).join(", ")}
                  {highUsageUsers.length > 3 && ` and ${highUsageUsers.length - 3} more`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="shrink-0 text-xs font-medium text-amber-700 underline dark:text-amber-400"
              >
                View all
              </button>
            </div>
          )}

          {/* ── Overview cards ── */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <CardSkel key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {/* Total Used */}
              <div className="rounded-2xl border border-gray-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Used</p>
                <p className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-white">{formatBytes(totalUsed)}</p>
                <p className="mt-1 text-xs text-gray-400">across {users.length} user{users.length !== 1 ? "s" : ""}</p>
              </div>

              {/* Total Quota */}
              <div className="rounded-2xl border border-gray-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Quota</p>
                <p className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-white">{formatBytes(totalQuota)}</p>
                <p className="mt-1 text-xs text-gray-400">allocated platform-wide</p>
              </div>

              {/* Utilization */}
              <div className="rounded-2xl border border-gray-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Utilization</p>
                <p className={`mt-2 text-3xl font-extrabold ${overviewColor}`}>{usedPct.toFixed(1)}%</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                  <div className={`h-full origin-left rounded-full transition-transform duration-700 ${barColor}`} style={{ transform: `scaleX(${(usedPct / 100).toFixed(4)})` }} />
                </div>
              </div>

              {/* Files / Sessions */}
              <div className="rounded-2xl border border-gray-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Upload Sessions</p>
                <p className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-white">{formatCompactNumber(sessions.length)}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {sessions.filter((s) => s.status === "uploading").length} active now
                </p>
              </div>
            </div>
          )}

          {!loading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  <ShieldCheck size={15} className="text-emerald-500" />
                  Quota Coverage
                </div>
                <p className="mt-2 text-xs text-gray-500">{users.filter((u) => u.storageQuota > 0).length} of {users.length} users have quota assigned</p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  <AlertTriangle size={15} className="text-amber-500" />
                  High Usage
                </div>
                <p className="mt-2 text-xs text-gray-500">{highUsageUsers.length} users at or above 80% quota</p>
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  <DatabaseZap size={15} className="text-blue-500" />
                  Sync Available
                </div>
                <p className="mt-2 text-xs text-gray-500">Recalculate user storage from active file records</p>
              </div>
            </div>
          )}

          {/* ── Charts row ── */}
          {!loading && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

              {/* File type breakdown */}
              <Card className="p-5">
                <div className="mb-5 flex items-center gap-2">
                  <HardDrive size={15} className="text-orange-500" />
                  <h3 className="font-semibold text-gray-900 dark:text-white">Storage by File Type</h3>
                </div>
                <div className="space-y-4">
                  {cats.map((cat) => (
                    <BarRow
                      key={cat.label}
                      label={cat.label}
                      value={cat.value}
                      total={breakdownTotal}
                      color={cat.color}
                      icon={cat.icon}
                    />
                  ))}
                </div>
                <div className="mt-5 border-t border-gray-100 pt-4 dark:border-zinc-800">
                  <div className="grid grid-cols-2 gap-3">
                    {cats.map((cat) => (
                      <div key={cat.label} className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${cat.color}`} />
                        <span className="text-xs text-gray-500 dark:text-gray-400">{cat.label}</span>
                        <span className="ml-auto text-xs font-semibold text-gray-700 dark:text-gray-300">{formatBytes(cat.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Upload Sessions */}
              <Card className="overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Upload size={15} className="text-blue-500" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">Recent Upload Sessions</h3>
                    </div>
                    <span className="text-xs text-gray-400">{sessions.length} sessions</span>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-50 dark:divide-zinc-800/60">
                  {sessions.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center gap-2 text-gray-400">
                      <Clock size={20} className="opacity-40" />
                      <p className="text-xs">No upload sessions</p>
                    </div>
                  ) : (
                    sessions.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-200">
                            {s.fileName ?? "Unknown file"}
                          </p>
                          {s.size !== undefined && (
                            <p className="text-[11px] text-gray-400">{formatBytes(s.size)}</p>
                          )}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${sessionBadge(s.status)}`}>
                          {s.status ?? "unknown"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* ── Per-user storage table ── */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-gray-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Users Storage</h3>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
                  {users.length}
                </span>
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users…"
                  className="h-8 w-56 rounded-xl border border-gray-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <Spinner size={24} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-50 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">#</th>
                      <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">User</th>
                      <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Used</th>
                      <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Quota</th>
                      <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 min-w-32">Utilization</th>
                      <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/50">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-sm text-gray-400">
                          {search ? "No users match your search" : "No users found"}
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u, i) => {
                        const pct = u.storageQuota > 0
                          ? Math.min((u.storageUsed / u.storageQuota) * 100, 100)
                          : 0;
                        const uBar = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-orange-500";
                        return (
                          <tr key={u.id} className="group transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/20">
                            <td className="px-5 py-3 text-xs text-gray-400">#{i + 1}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar name={u.name} size={30} />
                                <div>
                                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{u.name}</p>
                                  <p className="text-[11px] text-gray-400">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs font-medium text-gray-700 dark:text-gray-300">
                              {formatBytes(u.storageUsed)}
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                              {formatBytes(u.storageQuota)}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                                  <div
                                    className={`h-full origin-left rounded-full transition-transform duration-500 ${uBar}`}
                                    style={{ transform: `scaleX(${(pct / 100).toFixed(4)})` }}
                                  />
                                </div>
                                <span className={`text-[11px] font-semibold ${pct >= 90 ? "text-red-500" : pct >= 75 ? "text-amber-500" : "text-gray-500"}`}>
                                  {pct.toFixed(0)}%
                                </span>
                                {pct >= 90 && <AlertTriangle size={11} className="text-red-500" />}
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => { setQuotaUser(u); setQuotaGB(String(Math.round((u.storageQuota || 10_737_418_240) / 1_073_741_824))); }}
                                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:border-zinc-700 dark:text-gray-400 dark:hover:border-orange-700 dark:hover:bg-orange-950/20 dark:hover:text-orange-400"
                                >
                                  <HardDrive size={10} /> Quota
                                </button>
                                <button
                                  type="button"
                                  disabled={syncingUser === u.id}
                                  onClick={() => handleSyncStorage(u)}
                                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-60 dark:border-zinc-700 dark:text-gray-400 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-400"
                                >
                                  <RefreshCw size={10} className={syncingUser === u.id ? "animate-spin" : ""} /> Sync
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ── High-usage alerts section ── */}
          {!loading && highUsageUsers.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-500" />
                  <h3 className="font-semibold text-gray-900 dark:text-white">High Usage Alerts</h3>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                    {highUsageUsers.length}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                {highUsageUsers.slice(0, 5).map((u) => {
                  const pct = Math.min((u.storageUsed / u.storageQuota) * 100, 100);
                  return (
                    <div key={u.id} className="flex items-center gap-4 px-5 py-3.5">
                      <Avatar name={u.name} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">{u.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                            <div className="h-full origin-left rounded-full bg-red-500 transition-transform duration-500" style={{ transform: `scaleX(${(pct / 100).toFixed(4)})` }} />
                          </div>
                          <span className="shrink-0 text-[11px] font-bold text-red-500">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatBytes(u.storageUsed)}</p>
                        <p className="text-[11px] text-gray-400">of {formatBytes(u.storageQuota)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setQuotaUser(u); setQuotaGB(String(Math.round((u.storageQuota || 10_737_418_240) / 1_073_741_824))); }}
                        className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-400 dark:hover:bg-amber-950/40"
                      >
                        Expand
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* ── Quota modal ── */}
        <Modal
          open={quotaUser !== null}
          onClose={() => setQuotaUser(null)}
          title="Update Storage Quota"
        >
          <form onSubmit={handleQuotaSave} className="space-y-4">
            {quotaUser && (
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-zinc-800/50">
                <Avatar name={quotaUser.name} size={36} />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{quotaUser.name}</p>
                  <p className="text-xs text-gray-400">{quotaUser.email}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Current: {formatBytes(quotaUser.storageUsed)} used / {formatBytes(quotaUser.storageQuota)} quota
                  </p>
                </div>
              </div>
            )}
            <Input
              label="New Quota (GB)"
              type="number"
              value={quotaGB}
              onChange={(e) => setQuotaGB(e.target.value)}
              min="1"
              max="10240"
              step="1"
              helperText="1 GB = 1,073,741,824 bytes"
            />
            <div className="flex flex-col gap-3 pt-2">
              <Button variant="secondary" fullWidth type="button" onClick={() => setQuotaUser(null)}>
                Cancel
              </Button>
              <Button fullWidth type="submit" loading={savingQuota} leftIcon={<Save size={14} />}>
                Save Quota
              </Button>
            </div>
          </form>
        </Modal>

      </DashboardLayout>
    </AuthGuard>
  );
}
