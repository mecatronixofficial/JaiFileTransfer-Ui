"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Send, Search, RefreshCw, ChevronLeft, ChevronRight,
  Mail, Link as LinkIcon, QrCode, Clock, CheckCircle2,
  Ban, Eye, Users, Download, Filter, HardDrive, ShieldCheck,
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
interface AdminTransfer {
  id: string;
  title?: string;
  method?: string;
  status?: string;
  fileCount?: number;
  totalSize?: number;
  recipients?: string[];
  views?: number;
  downloads?: number;
  sender?: { id?: string; name?: string; email?: string };
  senderId?: string | { _id?: string; id?: string; name?: string; email?: string };
  expiresAt?: string;
  hasPassword?: boolean;
  privacy?: string;
  createdAt: string;
}

interface TransferSummary {
  total: number;
  active: number;
  expired: number;
  disabled: number;
  totalSize: number;
  totalViews: number;
  totalDownloads: number;
}

const EMPTY_SUMMARY: TransferSummary = {
  total: 0,
  active: 0,
  expired: 0,
  disabled: 0,
  totalSize: 0,
  totalViews: 0,
  totalDownloads: 0,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapTransfer(raw: any): AdminTransfer {
  const senderDoc = typeof raw.senderId === "object" && raw.senderId !== null ? raw.senderId : raw.sender;
  return {
    id:         raw.id ?? raw._id ?? "",
    title:      raw.title ?? "Untitled transfer",
    method:     raw.method,
    status:     raw.status ?? "active",
    fileCount:  raw.fileCount ?? raw.files?.length ?? 0,
    totalSize:  raw.totalSize,
    recipients: raw.recipients ?? [],
    views:      raw.views ?? 0,
    downloads:  raw.downloads ?? 0,
    sender:     senderDoc ? {
      id: senderDoc.id ?? senderDoc._id,
      name: senderDoc.name,
      email: senderDoc.email,
    } : raw.sender,
    senderId:   typeof raw.senderId === "string" ? raw.senderId : raw.senderId?._id ?? raw.sender?.id,
    expiresAt:  raw.expiresAt,
    hasPassword:raw.hasPassword ?? false,
    privacy:    raw.privacy ?? "public",
    createdAt:  raw.createdAt ?? new Date().toISOString(),
  };
}

function parseTransfers(data: any): AdminTransfer[] {
  const arr =
    Array.isArray(data?.transfers)       ? data.transfers       :
    Array.isArray(data?.data?.transfers) ? data.data.transfers  :
    Array.isArray(data?.data?.items)     ? data.data.items      :
    Array.isArray(data?.items)           ? data.items           :
    Array.isArray(data?.data)            ? data.data            :
    Array.isArray(data)                  ? data                 : [];
  return arr.map(mapTransfer).filter((t: AdminTransfer) => t.id);
}

function parseTotal(data: any): number {
  return data?.pagination?.total ?? data?.data?.pagination?.total ?? data?.total ?? data?.data?.total ?? data?.meta?.total ?? data?.count ?? 0;
}

function parseSummary(data: any): TransferSummary {
  const raw = data?.summary ?? data?.data?.summary ?? {};
  return {
    total: Number(raw.total ?? parseTotal(data)) || 0,
    active: Number(raw.active) || 0,
    expired: Number(raw.expired) || 0,
    disabled: Number(raw.disabled) || 0,
    totalSize: Number(raw.totalSize) || 0,
    totalViews: Number(raw.totalViews) || 0,
    totalDownloads: Number(raw.totalDownloads) || 0,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ─── Helpers ─── */
function methodIcon(method?: string) {
  if (method === "email") return <Mail size={13} className="text-blue-500" />;
  if (method === "qr")    return <QrCode size={13} className="text-purple-500" />;
  return <LinkIcon size={13} className="text-orange-500" />;
}

function statusBadge(status?: string): string {
  const map: Record<string, string> = {
    active:   "bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-400",
    expired:  "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400",
    disabled: "bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400",
    pending:  "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-400",
  };
  return map[status ?? "active"] ?? map.active;
}

const STATUS_FILTERS = ["all", "active", "expired", "disabled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];
const PAGE_SIZE = 20;

/* ════════════════════════════════════════
   PAGE
════════════════════════════════════════ */
export default function AdminTransfersPage() {
  const { user: me } = useAuth();
  const router = useRouter();

  const role = me?.role?.toLowerCase();
  const isAdmin = role === "admin" || role === "superadmin";

  const [transfers,  setTransfers]  = useState<AdminTransfer[]>([]);
  const [total,      setTotal]      = useState(0);
  const [summary,    setSummary]    = useState<TransferSummary>(EMPTY_SUMMARY);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [status,     setStatus]     = useState<StatusFilter>("all");
  const [method,     setMethod]     = useState("all");
  const [page,       setPage]       = useState(1);

  useEffect(() => {
    if (me && !isAdmin) router.replace("/dashboard");
  }, [me, isAdmin, router]);

  const load = useCallback(async (silent = false) => {
    if (!isAdmin) return;
    if (!silent) setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: PAGE_SIZE };
      if (search.trim())  params.search = search.trim();
      if (status !== "all") params.status = status;
      if (method !== "all") params.method = method;

      const res = await adminApi.transfers(params);
      setTransfers(parseTransfers(res.data));
      const nextTotal = parseTotal(res.data);
      setTotal(nextTotal);
      setSummary(parseSummary(res.data));
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, search, status, method]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPage(1);
    }, 0);
    return () => window.clearTimeout(id);
  }, [search, status, method]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(search.trim() || status !== "all" || method !== "all");
  const pageSizeTotal = useMemo(() => transfers.reduce((sum, transfer) => sum + (transfer.totalSize ?? 0), 0), [transfers]);
  const pageRecipients = useMemo(() => transfers.reduce((sum, transfer) => sum + (transfer.recipients?.length ?? 0), 0), [transfers]);

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-6 pb-10">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-950/20 ring-1 ring-orange-200 dark:ring-orange-800/30">
                <Send size={18} className="text-orange-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transfer Manager</h1>
                <p className="text-xs text-gray-400 dark:text-gray-500">Live platform transfers, delivery modes, recipients, and engagement</p>
              </div>
            </div>
            <button type="button" onClick={() => load()} disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400 dark:hover:border-orange-700 dark:hover:text-orange-400">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            {[
              { label: "Total",    value: summary.total || total, icon: <Send size={13} />, color: "text-orange-500", format: "number" },
              { label: "Active",   value: summary.active, icon: <CheckCircle2 size={13} />, color: "text-green-500", format: "number" },
              { label: "Expired",  value: summary.expired, icon: <Clock size={13} />, color: "text-gray-500", format: "number" },
              { label: "Disabled", value: summary.disabled, icon: <Ban size={13} />, color: "text-red-500", format: "number" },
              { label: "Data", value: summary.totalSize || pageSizeTotal, icon: <HardDrive size={13} />, color: "text-blue-500", format: "bytes" },
              { label: "Downloads", value: summary.totalDownloads, icon: <Download size={13} />, color: "text-purple-500", format: "number" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${s.color}`}>{s.icon} {s.label}</div>
                {loading ? <div className="h-6 w-12 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                  : <p className="text-xl font-bold text-gray-900 dark:text-white">{s.format === "bytes" ? formatBytes(s.value) : s.value.toLocaleString()}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                <Users size={15} className="text-sky-500" />
                Recipients on page
              </div>
              <p className="mt-2 text-xs text-gray-500">{pageRecipients.toLocaleString()} recipients across {transfers.length} loaded transfers</p>
            </div>
            <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                <Eye size={15} className="text-emerald-500" />
                Total views
              </div>
              <p className="mt-2 text-xs text-gray-500">{summary.totalViews.toLocaleString()} views in current result set</p>
            </div>
            <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                <ShieldCheck size={15} className="text-orange-500" />
                Filter state
              </div>
              <p className="mt-2 text-xs text-gray-500">{hasFilters ? "Filtered results active" : "Showing all accessible transfers"}</p>
            </div>
          </div>

          {/* Filters */}
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search transfers…"
                  className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
              </div>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setStatus("all"); setMethod("all"); }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                >
                  Clear filters
                </button>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Filter size={12} className="text-gray-400" />
                  {STATUS_FILTERS.map((s) => (
                    <button key={s} type="button" onClick={() => setStatus(s)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                        status === s
                          ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/20 dark:text-orange-400"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
                {(["all", "email", "link", "qr"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMethod(m)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                      method === m
                        ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/20 dark:text-blue-400"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {loading ? (
              <div className="flex h-52 items-center justify-center"><Spinner size={24} /></div>
            ) : transfers.length === 0 ? (
              <EmptyState icon={<Send size={32} />} title="No transfers found" description={hasFilters ? "Try clearing filters or searching another transfer" : "Transfers will appear here after users send files"} />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <tr>
                        {["Transfer", "Sender", "Method", "Files", "Views", "Downloads", "Status", "Created"].map((h) => (
                          <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                      {transfers.map((t) => (
                        <tr key={t.id} className="transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                          <td className="px-5 py-3.5">
                            <p className="max-w-44 truncate text-xs font-semibold text-gray-800 dark:text-gray-200">{t.title}</p>
                            <p className="font-mono text-[11px] text-gray-400">{t.id.slice(0, 10)}…</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {t.hasPassword && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-zinc-800 dark:text-gray-400">Password</span>}
                              {t.privacy && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold capitalize text-gray-500 dark:bg-zinc-800 dark:text-gray-400">{t.privacy}</span>}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            {t.sender ? (
                              <div className="flex items-center gap-2">
                                <Avatar name={t.sender.name ?? "?"} size={24} />
                                <div>
                                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{t.sender.name ?? "Unknown"}</p>
                                  <p className="text-[11px] text-gray-400">{t.sender.email}</p>
                                </div>
                              </div>
                            ) : <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5 capitalize">
                              {methodIcon(t.method)}
                              <span className="text-xs text-gray-600 dark:text-gray-400">{t.method ?? "link"}</span>
                            </div>
                            {t.recipients && t.recipients.length > 0 && (
                              <p className="mt-1 text-[11px] text-gray-400">{t.recipients.length} recipient{t.recipients.length !== 1 ? "s" : ""}</p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{t.fileCount ?? 0}</p>
                            {t.totalSize !== undefined && (
                              <p className="text-[11px] text-gray-400">{formatBytes(t.totalSize)}</p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                              <Eye size={11} /> {t.views ?? 0}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                              <Download size={11} /> {t.downloads ?? 0}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadge(t.status)}`}>
                              {t.status ?? "active"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5">
                            <p className="text-xs text-gray-500">{formatRelative(t.createdAt)}</p>
                            <p className="text-[11px] text-gray-400">{formatDateTime(t.createdAt)}</p>
                            {t.expiresAt && <p className="mt-1 text-[11px] text-gray-400">Expires {formatRelative(t.expiresAt)}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3.5 dark:border-zinc-800">
                    <p className="text-xs text-gray-500">Page {page} of {totalPages} · {total} total</p>
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
