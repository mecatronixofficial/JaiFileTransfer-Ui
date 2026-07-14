"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Files, Search, RefreshCw, Trash2, Eye, Download,
  ChevronLeft, ChevronRight, FileText, Image, Video,
  AlertTriangle, HardDrive, Filter, X,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { EmptyState, Spinner, Avatar } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { formatBytes, formatRelative, formatDateTime } from "@/lib/utils";
import { handleApiError } from "@/lib/error-handler";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";

/* ─── Types ─── */
interface AdminFile {
  id: string;
  name?: string;
  originalName?: string;
  fileName?: string;
  size?: number;
  mimeType?: string;
  extension?: string;
  status?: string;
  isTrashed?: boolean;
  owner?: { id: string; name?: string; email?: string };
  ownerId?: string;
  createdAt: string;
  updatedAt?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapFile(raw: any): AdminFile {
  return {
    id:           raw.id ?? raw._id ?? "",
    name:         raw.originalName ?? raw.name ?? raw.fileName ?? "Untitled",
    originalName: raw.originalName ?? raw.name ?? raw.fileName,
    size:         raw.size ?? raw.fileSize,
    mimeType:     raw.mimeType ?? "",
    extension:    raw.extension ?? raw.mimeType?.split("/")[1] ?? "",
    status:       raw.status,
    isTrashed:    raw.isTrashed ?? false,
    owner:        raw.owner,
    ownerId:      raw.ownerId ?? raw.owner?.id,
    createdAt:    raw.createdAt ?? new Date().toISOString(),
    updatedAt:    raw.updatedAt,
  };
}

function parseFiles(data: any): AdminFile[] {
  const arr =
    Array.isArray(data?.files)       ? data.files       :
    Array.isArray(data?.data?.files) ? data.data.files  :
    Array.isArray(data?.data?.items) ? data.data.items  :
    Array.isArray(data?.items)       ? data.items       :
    Array.isArray(data?.data)        ? data.data        :
    Array.isArray(data)              ? data             : [];
  return arr.map(mapFile).filter((f: AdminFile) => f.id);
}

function parseTotal(data: any): number {
  return data?.total ?? data?.data?.total ?? data?.meta?.total ?? data?.count ?? 0;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ─── Helpers ─── */
function mimeIcon(mime = "") {
  if (mime.startsWith("image/")) return <Image size={13} className="text-amber-500" />;
  if (mime.startsWith("video/")) return <Video size={13} className="text-purple-500" />;
  if (mime.includes("pdf"))       return <FileText size={13} className="text-red-500" />;
  return <FileText size={13} className="text-blue-500" />;
}

function statusBadge(status?: string, isTrashed?: boolean) {
  if (isTrashed) return "bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400";
  const map: Record<string, string> = {
    active:     "bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-400",
    processing: "bg-blue-100 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400",
    deleted:    "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400",
  };
  return map[status ?? "active"] ?? map.active;
}

const PAGE_SIZE = 20;

/* ════════════════════════════════════════
   PAGE
════════════════════════════════════════ */
export default function AdminFilesPage() {
  const { user: me } = useAuth();
  const router = useRouter();

  const role = me?.role?.toLowerCase();
  const isAdmin = role === "admin" || role === "superadmin";

  const [files,      setFiles]      = useState<AdminFile[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [fetchKey,   setFetchKey]   = useState(0);
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page,       setPage]       = useState(1);
  const [showTrashed,setShowTrashed]= useState(false);

  useEffect(() => {
    if (me && !isAdmin) router.replace("/dashboard");
  }, [me, isAdmin, router]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        limit: PAGE_SIZE,
        includeTrashed: showTrashed,
      };
      if (search.trim()) params.search = search.trim();
      if (typeFilter !== "all") params.mimeType = typeFilter;

      const res = await adminApi.files(params);
      setFiles(parseFiles(res.data));
      setTotal(parseTotal(res.data));
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, search, typeFilter, showTrashed]);

  useEffect(() => { load(); }, [load, fetchKey]);
  useEffect(() => { setPage(1); }, [search, typeFilter, showTrashed]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const stats = useMemo(() => ({
    total,
    trashed: files.filter((f) => f.isTrashed).length,
    images:  files.filter((f) => f.mimeType?.startsWith("image/")).length,
    docs:    files.filter((f) => f.mimeType?.includes("pdf") || f.mimeType?.includes("word")).length,
  }), [files, total]);

  const TYPE_FILTERS = [
    { value: "all",      label: "All types" },
    { value: "image",    label: "Images" },
    { value: "video",    label: "Videos" },
    { value: "application/pdf", label: "PDFs" },
  ];

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-6 pb-10">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/20 ring-1 ring-blue-200 dark:ring-blue-800/30">
                <Files size={18} className="text-blue-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Files</h1>
                <p className="text-xs text-gray-400 dark:text-gray-500">Platform-wide file management</p>
              </div>
            </div>
            <button type="button" onClick={() => setFetchKey((k) => k + 1)} disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400 dark:hover:border-orange-700 dark:hover:text-orange-400">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Files",   value: total,        icon: <Files size={13} />,       color: "text-blue-500" },
              { label: "Trashed",       value: stats.trashed, icon: <Trash2 size={13} />,      color: "text-red-500" },
              { label: "Images",        value: stats.images,  icon: <Image size={13} />,        color: "text-amber-500" },
              { label: "Documents",     value: stats.docs,    icon: <FileText size={13} />,     color: "text-purple-500" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${s.color}`}>{s.icon} {s.label}</div>
                {loading ? <div className="h-6 w-12 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                  : <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>}
              </div>
            ))}
          </div>

          {/* Filters */}
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by filename…"
                  className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-1">
                  <Filter size={12} className="text-gray-400" />
                  {TYPE_FILTERS.map((t) => (
                    <button key={t.value} type="button" onClick={() => setTypeFilter(t.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        typeFilter === t.value
                          ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/20 dark:text-orange-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setShowTrashed((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    showTrashed
                      ? "border-red-300 bg-red-50 text-red-600 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400"
                      : "border-gray-200 bg-white text-gray-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                  }`}>
                  <Trash2 size={12} /> {showTrashed ? "Hide trashed" : "Show trashed"}
                </button>
              </div>
            </div>
          </Card>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {loading ? (
              <div className="flex h-52 items-center justify-center"><Spinner size={24} /></div>
            ) : files.length === 0 ? (
              <EmptyState icon={<Files size={32} />} title="No files found" description="Try adjusting your search or filters" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <tr>
                        {["File", "Owner", "Size", "Type", "Status", "Uploaded"].map((h) => (
                          <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                      {files.map((f) => (
                        <tr key={f.id} className="transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              {mimeIcon(f.mimeType)}
                              <div>
                                <p className="max-w-48 truncate text-xs font-semibold text-gray-800 dark:text-gray-200">
                                  {f.name ?? "Untitled"}
                                </p>
                                <p className="text-[11px] text-gray-400 font-mono">{f.id.slice(0, 12)}…</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            {f.owner ? (
                              <div className="flex items-center gap-2">
                                <Avatar name={f.owner.name ?? "?"} size={24} />
                                <div>
                                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.owner.name ?? "Unknown"}</p>
                                  <p className="text-[11px] text-gray-400">{f.owner.email}</p>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-gray-400">
                            {f.size !== undefined ? formatBytes(f.size) : "—"}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-zinc-800 dark:text-gray-400">
                              {f.extension ?? f.mimeType?.split("/")[1] ?? "—"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadge(f.status, f.isTrashed)}`}>
                              {f.isTrashed ? "trashed" : (f.status ?? "active")}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5">
                            <p className="text-xs text-gray-500">{formatRelative(f.createdAt)}</p>
                            <p className="text-[11px] text-gray-400">{formatDateTime(f.createdAt)}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3.5 dark:border-zinc-800">
                    <p className="text-xs text-gray-500">
                      Page {page} of {totalPages} · {total} total files
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500 disabled:opacity-40 dark:border-zinc-700">
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{page} / {totalPages}</span>
                      <button type="button" aria-label="Next page" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500 disabled:opacity-40 dark:border-zinc-700">
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
