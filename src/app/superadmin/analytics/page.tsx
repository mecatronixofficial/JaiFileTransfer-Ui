"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3, TrendingUp, TrendingDown, Users, Send, Download,
  HardDrive, RefreshCw, CheckCircle, XCircle, Clock,
  Upload, Link as LinkIcon, QrCode, Mail, FolderOpen, ShieldCheck,
  Database, Activity, Eye, FileText,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { Spinner } from "@/components/ui";
import { superadminApi } from "@/lib/api";
import { PlatformAnalytics } from "@/types";
import { formatBytes } from "@/lib/utils";
import { handleApiError } from "@/lib/error-handler";

/* ─── Types for optional monthly / geo / filetype breakdown ─── */
interface MonthlyRow {
  month: string;
  users?: number;
  transfers?: number;
  downloads?: number;
  storage?: number;
}

interface CountryRow { country: string; users: number; pct: number; }
interface FileTypeRow { type: string; count: number; pct: number; color: string; }
type ShareMethod = "link" | "qr" | "email";

interface MethodRow {
  method: ShareMethod;
  label: string;
  value: number;
  pct: number;
  color: string;
}

interface ProjectMetrics {
  totalFiles: number;
  totalFolders: number;
  recentUploads: number;
  uploadsToday: number;
  activeUsers: number;
  storageQuota: number;
  storageUsedPct: number;
  linkShares: number;
  qrShares: number;
  emailShares: number;
  totalShares: number;
}

interface AnalyticsData {
  platform: PlatformAnalytics;
  project: ProjectMetrics;
  monthly?: MonthlyRow[];
  countries?: CountryRow[];
  fileTypes?: FileTypeRow[];
  methods: MethodRow[];
}

/* ─── Stat card ─── */
function StatCard({
  icon, label, value, sub, trend, gradient, loading,
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; trend?: number; gradient: string; loading?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200/60 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br ${gradient} text-white shadow-md`}>
        {icon}
      </div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      {loading
        ? <div className="mt-1 h-7 w-20 animate-pulse rounded-lg bg-gray-200 dark:bg-zinc-800" />
        : <h3 className="mt-0.5 text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>}
      {(sub || trend !== undefined) && !loading && (
        <div className="mt-1.5 flex items-center gap-2">
          {sub && <span className="text-xs text-gray-500">{sub}</span>}
          {trend !== undefined && (
            <span className={`flex items-center gap-0.5 text-xs font-semibold ${trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Mini bar chart ─── */
function MiniBarChart({
  data, dataKey, color, formatter,
}: {
  data: MonthlyRow[];
  dataKey: keyof MonthlyRow;
  color: string;
  formatter?: (v: number) => string;
}) {
  const values = data.map((d) => Number(d[dataKey] ?? 0));
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-24 items-end gap-1.5">
      {data.map((d, i) => {
        const val = Number(d[dataKey] ?? 0);
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t-sm ${color} opacity-80 transition-opacity hover:opacity-100`}
              style={{ height: `${Math.max((val / max) * 88, 4)}px` }}
              title={`${d.month}: ${formatter ? formatter(val) : val.toLocaleString()}`}
            />
            <span className="origin-left rotate-45 text-[9px] text-gray-400">
              {d.month.split(" ")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Bar breakdown row ─── */
function BreakdownRow({
  label, value, pct, barColor,
}: {
  label: string; value: string; pct: number; barColor: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <span className="font-semibold text-gray-900 dark:text-white">
          {value}{" "}
          <span className="text-xs font-normal text-gray-400">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const FILE_TYPE_COLORS = ["bg-red-500", "bg-yellow-500", "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-gray-400"];

function readNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function pct(value: number, total: number): number {
  if (!total) return 0;
  return Math.min(Math.round((value / total) * 100), 100);
}

/* ═══════════════════════════
   PAGE
═══════════════════════════ */
export default function AnalyticsPage() {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await superadminApi.analytics();
      const raw = res.data?.data ?? res.data ?? {};

      /* ── Platform KPIs ── */
      const platform: PlatformAnalytics = {
        totalUsers:       readNumber(raw.users?.total, raw.totalUsers),
        totalAdmins:      readNumber(raw.users?.byRole?.admin, raw.totalAdmins),
        totalTransfers:   readNumber(raw.totalTransfers, raw.transfers?.total, raw.transferCount),
        totalStorage:     readNumber(raw.storage?.totalBytes, raw.totalStorage, raw.totalStorageUsed, raw.storageUsed),
        totalDownloads:   readNumber(raw.totalDownloads, raw.downloads?.total, raw.recentDownloads),
        totalViews:       readNumber(raw.totalViews, raw.views?.total, raw.shares?.views),
        activeLinks:      readNumber(raw.shares?.active, raw.activeLinks, raw.links?.active),
        expiredLinks:     readNumber(raw.expiredLinks, raw.links?.expired, raw.shares?.expired),
        disabledLinks:    readNumber(raw.disabledLinks, raw.links?.disabled, raw.shares?.disabled),
        newUsersToday:    readNumber(raw.newUsersToday, raw.users?.newToday),
        transfersToday:   readNumber(raw.transfersToday, raw.transfers?.today),
        downloadsToday:   readNumber(raw.downloadsToday, raw.downloads?.today),
        storageGrowthPct: readNumber(raw.storageGrowthPct, raw.storage?.growthPct),
        userGrowthPct:    readNumber(raw.userGrowthPct, raw.users?.growthPct),
      };

      const totalFiles = readNumber(raw.totalFiles, raw.files?.total, raw.fileCount);
      const totalFolders = readNumber(raw.totalFolders, raw.folders?.total, raw.folderCount);
      const storageQuota = readNumber(raw.storage?.quotaBytes, raw.totalStorageQuota, raw.storageQuota);
      const totalShares = readNumber(raw.shares?.total, raw.totalShares, raw.totalLinks, raw.links?.total);
      const linkShares = readNumber(raw.shares?.byMethod?.link, raw.links?.byMethod?.link, raw.linkShares);
      const qrShares = readNumber(raw.shares?.byMethod?.qr, raw.links?.byMethod?.qr, raw.qrShares);
      const emailShares = readNumber(raw.shares?.byMethod?.email, raw.links?.byMethod?.email, raw.emailShares);
      const inferredLinkShares = linkShares || Math.max(totalShares - qrShares - emailShares, 0);
      const methodTotal = inferredLinkShares + qrShares + emailShares || totalShares || platform.activeLinks;

      const project: ProjectMetrics = {
        totalFiles,
        totalFolders,
        recentUploads: readNumber(raw.recentUploads, raw.uploads?.recent),
        uploadsToday: readNumber(raw.uploadsToday, raw.recentUploads, raw.uploads?.today),
        activeUsers: readNumber(raw.activeUsers, raw.users?.active),
        storageQuota,
        storageUsedPct: storageQuota ? pct(platform.totalStorage, storageQuota) : readNumber(raw.storage?.percentage),
        linkShares: inferredLinkShares,
        qrShares,
        emailShares,
        totalShares: methodTotal,
      };

      const methods: MethodRow[] = [
        { method: "link", label: "Link Shares", value: inferredLinkShares, pct: pct(inferredLinkShares, methodTotal), color: "bg-purple-500" },
        { method: "qr", label: "QR Shares", value: qrShares, pct: pct(qrShares, methodTotal), color: "bg-emerald-500" },
        { method: "email", label: "Email Shares", value: emailShares, pct: pct(emailShares, methodTotal), color: "bg-blue-500" },
      ];

      /* ── Optional breakdown arrays ── */
      const monthly: MonthlyRow[] | undefined =
        Array.isArray(raw.monthly) ? raw.monthly : undefined;

      const countries: CountryRow[] | undefined =
        Array.isArray(raw.countries) ? raw.countries : undefined;

      const fileTypes: FileTypeRow[] | undefined =
        Array.isArray(raw.fileTypes)
          ? raw.fileTypes.map((ft: Record<string, unknown>, i: number) => ({
              type:  String(ft.type  ?? ft.mimeType ?? "Other"),
              count: Number(ft.count ?? ft.total    ?? 0),
              pct:   Number(ft.pct   ?? ft.percent  ?? 0),
              color: FILE_TYPE_COLORS[i % FILE_TYPE_COLORS.length],
            }))
          : undefined;

      setData({ platform, project, monthly, countries, fileTypes, methods });
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const p = data?.platform;
  const project = data?.project;
  const totalLinkStates = (p?.activeLinks ?? 0) + (p?.expiredLinks ?? 0) + (p?.disabledLinks ?? 0);
  const activeLinkPct = pct(p?.activeLinks ?? 0, totalLinkStates);
  const inactiveLinkPct = pct((p?.expiredLinks ?? 0) + (p?.disabledLinks ?? 0), totalLinkStates);
  const transferPerUser = useMemo(() => {
    const users = p?.totalUsers ?? 0;
    if (!users) return "0";
    return ((p?.totalTransfers ?? 0) / users).toFixed(1);
  }, [p?.totalTransfers, p?.totalUsers]);

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-6 pb-10">

          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900 dark:text-white">
                <BarChart3 size={22} className="text-orange-500" /> Platform Analytics
              </h1>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Storage, transfers, shares, users, and audit signals for Jai Export Enterprises
              </p>
            </div>
            <button type="button" onClick={() => load(true)} disabled={loading} aria-label="Refresh analytics"
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition-colors hover:text-orange-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard loading={loading} icon={<Users size={20} />}     label="Total Users"     value={(p?.totalUsers ?? 0).toLocaleString()}     sub={`+${p?.newUsersToday ?? 0} today`}     trend={p?.userGrowthPct}    gradient="from-orange-500 to-orange-600" />
            <StatCard loading={loading} icon={<Send size={20} />}      label="Total Transfers" value={(p?.totalTransfers ?? 0).toLocaleString()}  sub={`+${p?.transfersToday ?? 0} today`}    gradient="from-blue-500 to-cyan-500" />
            <StatCard loading={loading} icon={<HardDrive size={20} />} label="Total Storage"   value={formatBytes(p?.totalStorage ?? 0)}          sub="Across all users"                      trend={p?.storageGrowthPct} gradient="from-purple-500 to-violet-600" />
            <StatCard loading={loading} icon={<Download size={20} />}  label="Total Downloads" value={(p?.totalDownloads ?? 0).toLocaleString()}  sub={`+${p?.downloadsToday ?? 0} today`}    gradient="from-emerald-500 to-green-600" />
          </div>

          {/* ── Project data cards ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard loading={loading} icon={<FileText size={20} />}   label="Files Stored"    value={(project?.totalFiles ?? 0).toLocaleString()}   sub={`${project?.uploadsToday ?? 0} uploads today`} gradient="from-sky-500 to-blue-600" />
            <StatCard loading={loading} icon={<FolderOpen size={20} />} label="Folders"         value={(project?.totalFolders ?? 0).toLocaleString()} sub="Organized project paths"              gradient="from-amber-500 to-orange-500" />
            <StatCard loading={loading} icon={<ShieldCheck size={20} />} label="Active Users"    value={(project?.activeUsers ?? 0).toLocaleString()}  sub={`${p?.totalAdmins ?? 0} admins`}     gradient="from-teal-500 to-emerald-600" />
            <StatCard loading={loading} icon={<Activity size={20} />}    label="Transfers/User"  value={transferPerUser}                              sub="Average platform usage"              gradient="from-pink-500 to-rose-600" />
          </div>

          {/* ── Storage + activity health ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-gray-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Storage Utilization</h3>
                  <p className="mt-0.5 text-xs text-gray-400">Cloudflare R2 workspace usage across users</p>
                </div>
                <Database size={18} className="text-purple-500" />
              </div>
              {loading ? (
                <div className="h-3 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
              ) : (
                <>
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatBytes(p?.totalStorage ?? 0)}</p>
                      <p className="text-xs text-gray-400">
                        {project?.storageQuota ? `of ${formatBytes(project.storageQuota)} allocated` : "Quota data not available"}
                      </p>
                    </div>
                    <p className={`text-lg font-extrabold ${project?.storageUsedPct && project.storageUsedPct > 85 ? "text-red-500" : "text-emerald-500"}`}>
                      {(project?.storageUsedPct ?? 0).toFixed(1)}%
                    </p>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${project?.storageUsedPct && project.storageUsedPct > 85 ? "bg-red-500" : "bg-gradient-to-r from-purple-500 to-orange-400"}`}
                      style={{ width: `${Math.min(project?.storageUsedPct ?? 0, 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Today</h3>
                  <p className="mt-0.5 text-xs text-gray-400">Live operational pulse</p>
                </div>
                <Activity size={18} className="text-orange-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Users", value: p?.newUsersToday ?? 0, icon: <Users size={13} />, color: "text-orange-500" },
                  { label: "Uploads", value: project?.uploadsToday ?? 0, icon: <Upload size={13} />, color: "text-emerald-500" },
                  { label: "Transfers", value: p?.transfersToday ?? 0, icon: <Send size={13} />, color: "text-blue-500" },
                  { label: "Downloads", value: p?.downloadsToday ?? 0, icon: <Download size={13} />, color: "text-purple-500" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-zinc-800/60">
                    <div className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold ${item.color}`}>{item.icon}{item.label}</div>
                    <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{item.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Link status cards ── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800/40 dark:bg-emerald-900/10">
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Active Links</span>
              </div>
              {loading
                ? <div className="h-8 animate-pulse rounded-lg bg-emerald-200/60 dark:bg-emerald-800/30" />
                : <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{(p?.activeLinks ?? 0).toLocaleString()}</p>}
              {!loading && <p className="mt-1 text-[11px] font-semibold text-emerald-600">{activeLinkPct}% healthy</p>}
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
              <div className="mb-2 flex items-center gap-2">
                <Clock size={14} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-500">Expired Links</span>
              </div>
              {loading
                ? <div className="h-8 animate-pulse rounded-lg bg-gray-200 dark:bg-zinc-700" />
                : <p className="text-2xl font-bold tabular-nums text-gray-700 dark:text-gray-300">{(p?.expiredLinks ?? 0).toLocaleString()}</p>}
              {!loading && <p className="mt-1 text-[11px] font-semibold text-gray-400">Timed out links</p>}
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-800/40 dark:bg-red-900/10">
              <div className="mb-2 flex items-center gap-2">
                <XCircle size={14} className="text-red-400" />
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">Disabled Links</span>
              </div>
              {loading
                ? <div className="h-8 animate-pulse rounded-lg bg-red-200/60 dark:bg-red-800/30" />
                : <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-300">{(p?.disabledLinks ?? 0).toLocaleString()}</p>}
              {!loading && <p className="mt-1 text-[11px] font-semibold text-red-500">{inactiveLinkPct}% inactive total</p>}
            </div>
          </div>

          {/* ── Share mode analytics ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-gray-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Share Delivery Modes</h3>
                  <p className="mt-0.5 text-xs text-gray-400">Link, QR, and email share distribution</p>
                </div>
                <LinkIcon size={18} className="text-orange-500" />
              </div>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-gray-100 dark:bg-zinc-800" />)}
                </div>
              ) : (
                <div className="space-y-4">
                  {data?.methods.map((m) => (
                    <BreakdownRow
                      key={m.method}
                      label={m.label}
                      value={m.value.toLocaleString()}
                      pct={m.pct}
                      barColor={m.color}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { label: "Link Shares", value: project?.linkShares ?? 0, icon: <LinkIcon size={18} />, cls: "border-purple-200 bg-purple-50/60 text-purple-600 dark:border-purple-800/40 dark:bg-purple-900/10 dark:text-purple-400" },
                { label: "QR Shares", value: project?.qrShares ?? 0, icon: <QrCode size={18} />, cls: "border-emerald-200 bg-emerald-50/60 text-emerald-600 dark:border-emerald-800/40 dark:bg-emerald-900/10 dark:text-emerald-400" },
                { label: "Email Shares", value: project?.emailShares ?? 0, icon: <Mail size={18} />, cls: "border-blue-200 bg-blue-50/60 text-blue-600 dark:border-blue-800/40 dark:bg-blue-900/10 dark:text-blue-400" },
              ].map((mode) => (
                <div key={mode.label} className={`rounded-2xl border p-5 ${mode.cls}`}>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 dark:bg-zinc-900/40">
                    {mode.icon}
                  </div>
                  {loading
                    ? <div className="h-8 animate-pulse rounded-lg bg-white/60 dark:bg-zinc-800/60" />
                    : <p className="text-2xl font-bold tabular-nums">{mode.value.toLocaleString()}</p>}
                  <p className="mt-1 text-xs font-semibold opacity-80">{mode.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Secondary stats: views + admins ── */}
          <div className="grid grid-cols-2 gap-4">
            <StatCard loading={loading} icon={<Eye size={20} />} label="Total Views"  value={(p?.totalViews ?? 0).toLocaleString()}   gradient="from-sky-500 to-blue-500" />
            <StatCard loading={loading} icon={<Users size={20} />}    label="Total Admins"  value={(p?.totalAdmins ?? 0).toLocaleString()}  gradient="from-amber-500 to-yellow-500" />
          </div>

          {/* ── Monthly trend charts (only if API returns data) ── */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-2xl border border-gray-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-4 h-4 w-40 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                  <div className="flex h-24 items-end gap-1.5">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <div key={j} className="flex-1 animate-pulse rounded-t-sm bg-gray-100 dark:bg-zinc-800"
                        style={{ height: `${30 + Math.random() * 58}px` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : data?.monthly && data.monthly.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-gray-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Users (monthly)</h3>
                  <MiniBarChart data={data.monthly} dataKey="users" color="bg-orange-400" />
                </div>
                <div className="rounded-2xl border border-gray-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Transfers Sent (monthly)</h3>
                  <MiniBarChart data={data.monthly} dataKey="transfers" color="bg-blue-400" />
                </div>
                <div className="rounded-2xl border border-gray-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Downloads (monthly)</h3>
                  <MiniBarChart data={data.monthly} dataKey="downloads" color="bg-emerald-400" />
                </div>
                <div className="rounded-2xl border border-gray-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Storage Growth (monthly)</h3>
                  <MiniBarChart data={data.monthly} dataKey="storage" color="bg-purple-400" formatter={formatBytes} />
                </div>
              </div>

              {/* Monthly table */}
              <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <div className="border-b border-gray-100 px-6 py-4 dark:border-zinc-800">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Monthly Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Month</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Users</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Transfers</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Downloads</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Storage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                      {[...data.monthly].reverse().map((row) => (
                        <tr key={row.month} className="hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                          <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white">{row.month}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{(row.users ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{(row.transfers ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{(row.downloads ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{formatBytes(row.storage ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : !loading && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
              <BarChart3 size={28} className="mx-auto mb-2 text-gray-300 dark:text-zinc-600" />
              <p className="text-sm font-medium text-gray-500">Monthly breakdown not available</p>
              <p className="mt-0.5 text-xs text-gray-400">The analytics API did not return monthly data.</p>
            </div>
          )}

          {/* ── Geography + file types (only if API returns data) ── */}
          {(data?.countries || data?.fileTypes) && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {data.countries && data.countries.length > 0 && (
                <div className="rounded-2xl border border-gray-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Users by Country</h3>
                  <div className="space-y-3">
                    {data.countries.map((c) => (
                      <BreakdownRow
                        key={c.country}
                        label={c.country}
                        value={c.users.toLocaleString()}
                        pct={c.pct}
                        barColor="bg-gradient-to-r from-orange-400 to-amber-400"
                      />
                    ))}
                  </div>
                </div>
              )}

              {data.fileTypes && data.fileTypes.length > 0 && (
                <div className="rounded-2xl border border-gray-200/70 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">File Types Transferred</h3>
                  <div className="space-y-3">
                    {data.fileTypes.map((f) => (
                      <BreakdownRow
                        key={f.type}
                        label={f.type}
                        value={f.count.toLocaleString()}
                        pct={f.pct}
                        barColor={f.color}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading overlay for silent refresh */}
          {loading && !data && (
            <div className="flex items-center justify-center py-20">
              <Spinner size={28} />
            </div>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
