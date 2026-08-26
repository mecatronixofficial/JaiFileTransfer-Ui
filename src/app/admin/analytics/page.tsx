"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  Files,
  HardDrive,
  Link2,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";

import AuthGuard from "@/components/auth/AuthGuard";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import {
  type AdminAnalyticsData,
  type AnalyticsBreakdownRow,
  loadAdminAnalytics,
} from "@/lib/admin-analytics";
import { formatBytes, formatDateTime } from "@/lib/utils";

function percent(value: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((value / total) * 1000) / 10) : 0;
}

function KpiCard({
  label,
  value,
  helper,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone: string;
  loading: boolean;
}) {
  return (
    <article className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded-lg bg-gray-100 dark:bg-zinc-800" />
          ) : (
            <p className="mt-1 truncate text-2xl font-bold tabular-nums text-gray-950 dark:text-white">{value}</p>
          )}
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${tone}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 truncate text-[11px] text-gray-400">{helper}</p>
    </article>
  );
}

const BAR_TONES: Record<string, string> = {
  link: "bg-purple-500",
  qr: "bg-emerald-500",
  email: "bg-blue-500",
  images: "bg-amber-500",
  documents: "bg-blue-500",
  pdfs: "bg-red-500",
  spreadsheets: "bg-emerald-500",
  videos: "bg-purple-500",
  other: "bg-slate-400",
  private: "bg-slate-500",
  view: "bg-sky-500",
  download: "bg-orange-500",
};

function BreakdownList({
  rows,
  valueFormatter = (value) => value.toLocaleString(),
  emptyText,
}: {
  rows: AnalyticsBreakdownRow[];
  valueFormatter?: (value: number) => string;
  emptyText: string;
}) {
  if (rows.length === 0 || rows.every((row) => row.count === 0 && !row.bytes)) {
    return <p className="py-8 text-center text-xs text-gray-400">{emptyText}</p>;
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="truncate text-xs font-medium text-gray-600 dark:text-gray-300">{row.label}</span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-gray-900 dark:text-white">
              {valueFormatter(row.bytes || row.count)}
              <span className="ml-1 font-normal text-gray-400">{row.percentage}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
            <div
              className={`h-full origin-left rounded-full transition-transform duration-500 ${BAR_TONES[row.key] ?? "bg-orange-500"}`}
              style={{ transform: `scaleX(${row.percentage / 100})` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-[11px] text-gray-400">{subtitle}</p>
        </div>
        <span className="text-orange-500">{icon}</span>
      </div>
      {children}
    </section>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const role = user?.role?.toLowerCase();
  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperadmin = role === "superadmin";
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/dashboard");
  }, [isAdmin, router, user]);

  const load = useCallback(async (silent = false) => {
    if (!isAdmin) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const next = await loadAdminAnalytics();
      if (next.failedSources.length === 6) {
        throw new Error("The analytics services are currently unavailable.");
      }
      setData(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analytics could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const transferMethodTotal = useMemo(
    () => data?.transferMethods.reduce((sum, method) => sum + method.count, 0) ?? 0,
    [data?.transferMethods],
  );
  const linkTotal =
    (data?.activeLinks ?? 0) +
    (data?.expiredLinks ?? 0) +
    (data?.disabledLinks ?? 0);
  const userActivePct = percent(data?.activeUsers ?? 0, data?.totalUsers ?? 0);
  const linkActivePct = percent(data?.activeLinks ?? 0, linkTotal || data?.totalLinks || 0);
  const methodStops = useMemo(() => {
    const link = data?.transferMethods.find((method) => method.key === "link")?.percentage ?? 0;
    const qr = data?.transferMethods.find((method) => method.key === "qr")?.percentage ?? 0;
    return { link, qr: link + qr };
  }, [data?.transferMethods]);

  const scopeLabel = isSuperadmin ? "Platform-wide analytics" : "Analytics for your managed admin scope";

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-6 pb-10">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:ring-orange-800/40">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-gray-950 dark:text-white">Admin analytics</h1>
                <p className="text-xs text-gray-400 dark:text-gray-500">{scopeLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {data && (
                <p className="hidden text-[11px] text-gray-400 sm:block">
                  Updated <time dateTime={data.generatedAt}>{formatDateTime(data.generatedAt)}</time>
                </p>
              )}
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={loading || refreshing}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading || refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </header>

          {error && !data && (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/60 px-6 text-center dark:border-red-900/40 dark:bg-red-950/20">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <h2 className="mt-3 text-base font-bold text-red-800 dark:text-red-300">Analytics unavailable</h2>
              <p className="mt-1 max-w-md text-sm text-red-600 dark:text-red-400">{error}</p>
              <button type="button" onClick={() => void load()} className="mt-5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700">
                Try again
              </button>
            </div>
          )}

          {!error || data ? (
            <>
              {data && data.failedSources.length > 0 && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Some analytics are temporarily unavailable</p>
                    <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">Missing: {data.failedSources.join(", ")}</p>
                  </div>
                </div>
              )}

              {loading && !data ? (
                <AnalyticsSkeleton />
              ) : (
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  <KpiCard loading={false} label="Users" value={(data?.totalUsers ?? 0).toLocaleString()} helper={`${userActivePct}% active · ${data?.newUsersToday ?? 0} new today`} icon={<Users className="h-5 w-5" />} tone="bg-orange-50 text-orange-600 ring-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:ring-orange-800/40" />
                  <KpiCard loading={false} label="Files" value={(data?.totalFiles ?? 0).toLocaleString()} helper={`${data?.filesInTrash ?? 0} in trash · ${data?.uploadsToday ?? 0} uploaded today`} icon={<Files className="h-5 w-5" />} tone="bg-blue-50 text-blue-600 ring-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:ring-blue-800/40" />
                  <KpiCard loading={false} label="Transfers" value={(data?.totalTransfers ?? 0).toLocaleString()} helper={`${data?.activeTransfers ?? 0} active · ${data?.transfersToday ?? 0} today`} icon={<Send className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:ring-emerald-800/40" />
                  <KpiCard loading={false} label="Storage" value={formatBytes(data?.totalStorage ?? 0)} helper="Active file storage tracked" icon={<HardDrive className="h-5 w-5" />} tone="bg-purple-50 text-purple-600 ring-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:ring-purple-800/40" />
                </div>
              )}

              {data && (
                <>
                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <Panel title="Transfer delivery" subtitle="Exact totals by delivery method" icon={<Send className="h-5 w-5" />}>
                      <div className="grid items-center gap-6 sm:grid-cols-[150px_1fr]">
                        <div
                          role="img"
                          aria-label={`Transfer methods: ${data.transferMethods.map((method) => `${method.label} ${method.percentage}%`).join(", ")}`}
                          className="relative mx-auto h-36 w-36 rounded-full"
                          style={{
                            background: transferMethodTotal > 0
                              ? `conic-gradient(#a855f7 0 ${methodStops.link}%, #10b981 ${methodStops.link}% ${methodStops.qr}%, #3b82f6 ${methodStops.qr}% 100%)`
                              : "#f3f4f6",
                          }}
                        >
                          <span className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white dark:bg-zinc-900">
                            <span className="text-xl font-bold tabular-nums text-gray-950 dark:text-white">{transferMethodTotal.toLocaleString()}</span>
                            <span className="text-[10px] text-gray-400">classified</span>
                          </span>
                        </div>
                        <BreakdownList rows={data.transferMethods} emptyText="No transfer method data available" />
                      </div>
                    </Panel>

                    <Panel title="Today’s activity" subtitle="Current operational pulse" icon={<Activity className="h-5 w-5" />}>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "New users", value: data.newUsersToday, icon: <Users className="h-4 w-4" />, tone: "text-orange-600 bg-orange-50 dark:bg-orange-950/20" },
                          { label: "Uploads", value: data.uploadsToday, icon: <Files className="h-4 w-4" />, tone: "text-blue-600 bg-blue-50 dark:bg-blue-950/20" },
                          { label: "Transfers", value: data.transfersToday, icon: <Send className="h-4 w-4" />, tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20" },
                          { label: "Downloads", value: data.downloadsToday, icon: <Download className="h-4 w-4" />, tone: "text-purple-600 bg-purple-50 dark:bg-purple-950/20" },
                        ].map((item) => (
                          <div key={item.label} className={`rounded-2xl p-4 ${item.tone}`}>
                            <div className="flex items-center gap-2 text-[11px] font-semibold">{item.icon}{item.label}</div>
                            <p className="mt-2 text-2xl font-bold tabular-nums">{item.value.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    </Panel>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Panel title="Storage composition" subtitle={`${formatBytes(data.totalStorage)} across active files`} icon={<HardDrive className="h-5 w-5" />}>
                      <BreakdownList rows={data.storageCategories} valueFormatter={formatBytes} emptyText="No storage category data available" />
                    </Panel>
                    <Panel title="Share configuration" subtitle={`${data.totalShares.toLocaleString()} shares in scope`} icon={<Share2 className="h-5 w-5" />}>
                      <div className="grid gap-6 sm:grid-cols-2">
                        <div>
                          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Share types</p>
                          <BreakdownList rows={data.shareTypes} emptyText="No share type data" />
                        </div>
                        <div>
                          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Permissions</p>
                          <BreakdownList rows={data.sharePermissions} emptyText="No permission data" />
                        </div>
                      </div>
                    </Panel>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                    <Panel title="Link health" subtitle={`${(data.totalLinks || linkTotal).toLocaleString()} generated links`} icon={<Link2 className="h-5 w-5" />}>
                      <div className="mb-5 h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                        <div className="flex h-full">
                          <span className="bg-emerald-500" style={{ width: `${percent(data.activeLinks, linkTotal)}%` }} />
                          <span className="bg-amber-400" style={{ width: `${percent(data.expiredLinks, linkTotal)}%` }} />
                          <span className="bg-red-500" style={{ width: `${percent(data.disabledLinks, linkTotal)}%` }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: "Active", value: data.activeLinks, icon: <CheckCircle2 className="h-4 w-4" />, tone: "text-emerald-600" },
                          { label: "Expired", value: data.expiredLinks, icon: <Clock3 className="h-4 w-4" />, tone: "text-amber-600" },
                          { label: "Disabled", value: data.disabledLinks, icon: <XCircle className="h-4 w-4" />, tone: "text-red-600" },
                        ].map((item) => (
                          <div key={item.label} className="rounded-xl bg-gray-50 p-3 text-center dark:bg-zinc-800/60">
                            <span className={`mx-auto flex justify-center ${item.tone}`}>{item.icon}</span>
                            <p className="mt-1 text-lg font-bold tabular-nums text-gray-950 dark:text-white">{item.value.toLocaleString()}</p>
                            <p className="text-[10px] text-gray-400">{item.label}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 text-center text-xs font-semibold text-emerald-600">{linkActivePct}% of classified links are active</p>
                    </Panel>

                    <Panel title="Sharing engagement" subtitle="Views and downloads from share records" icon={<ShieldCheck className="h-5 w-5" />}>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-sky-50 p-4 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400">
                          <Eye className="h-5 w-5" />
                          <p className="mt-3 text-2xl font-bold tabular-nums">{data.shareViews.toLocaleString()}</p>
                          <p className="text-[11px] font-semibold">Share views</p>
                        </div>
                        <div className="rounded-2xl bg-orange-50 p-4 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400">
                          <Download className="h-5 w-5" />
                          <p className="mt-3 text-2xl font-bold tabular-nums">{data.shareDownloads.toLocaleString()}</p>
                          <p className="text-[11px] font-semibold">Share downloads</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 text-xs dark:border-zinc-800">
                        <span className="text-gray-500 dark:text-gray-400">Active shares</span>
                        <span className="font-bold text-gray-900 dark:text-white">{data.activeShares.toLocaleString()} / {data.totalShares.toLocaleString()}</span>
                      </div>
                    </Panel>
                  </div>

                  <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                      <div>
                        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Top shared files</h2>
                        <p className="mt-0.5 text-[11px] text-gray-400">Active file shares ranked by views</p>
                      </div>
                      <Share2 className="h-5 w-5 text-orange-500" />
                    </div>
                    {data.topSharedFiles.length === 0 ? (
                      <p className="py-10 text-center text-xs text-gray-400">No active shared files available</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[680px] text-sm">
                          <thead className="bg-gray-50/70 dark:bg-zinc-800/30">
                            <tr>
                              {["File", "Owner", "Access", "Views", "Downloads"].map((heading) => (
                                <th key={heading} className={`px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 ${heading === "Views" || heading === "Downloads" ? "text-right" : ""}`}>{heading}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                            {data.topSharedFiles.map((file) => (
                              <tr key={file.id} className="hover:bg-gray-50/70 dark:hover:bg-zinc-800/30">
                                <td className="px-5 py-3.5"><p className="max-w-64 truncate text-xs font-semibold text-gray-800 dark:text-gray-200" title={file.name}>{file.name}</p></td>
                                <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">{file.owner}</td>
                                <td className="px-5 py-3.5"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-gray-600 dark:bg-zinc-800 dark:text-gray-300">{file.type} · {file.permission}</span></td>
                                <td className="px-5 py-3.5 text-right text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-300">{file.views.toLocaleString()}</td>
                                <td className="px-5 py-3.5 text-right text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-300">{file.downloads.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          ) : null}

          {refreshing && (
            <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-600 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300">
              <Spinner size={14} /> Refreshing analytics…
            </div>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
