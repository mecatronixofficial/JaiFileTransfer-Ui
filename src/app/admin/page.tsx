"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { formatBytes, formatRelative, formatCompactNumber } from "@/lib/utils";
import {
  Users, Files, HardDrive, Activity, Upload, Download, RefreshCw,
  Send, Link as LinkIcon, Share2, TrendingUp, ArrowUpRight, Eye,
  Shield, AlertTriangle, CheckCircle2, BarChart3,
  FolderOpen, Zap, Database, ScrollText, Server,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { handleApiError } from "@/lib/error-handler";
import Card from "@/components/ui/Card";
import { Spinner } from "@/components/ui";
import {
  loadAdminDashboardData,
  type AdminDashboardCard,
} from "@/lib/admin-dashboard";

/* ─── Types ─── */
interface OverviewData {
  totalUsers?: number;
  activeUsers?: number;
  totalFiles?: number;
  totalStorage?: number;
  totalStorageUsed?: number;
  recentUploads?: number;
  recentDownloads?: number;
  totalTransfers?: number;
  activeLinks?: number;
  totalDownloads?: number;
  totalViews?: number;
  newUsersToday?: number;
  transfersToday?: number;
  downloadsToday?: number;
  storageGrowthPct?: number;
  userGrowthPct?: number;
  [key: string]: unknown;
}

interface ActivityItem {
  id: string;
  action: string;
  type?: string;
  description?: string;
  message?: string;
  user?: { name?: string; email?: string; role?: string };
  actor?: { name?: string; email?: string; role?: string };
  actorName?: string;
  actorEmail?: string;
  resourceName?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/* ─── Action config ─── */
const ACTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  upload:           { label: "File upload",       icon: <Upload size={12} />,    color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  file_upload:      { label: "File upload",       icon: <Upload size={12} />,    color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  download:         { label: "File download",     icon: <Download size={12} />,  color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-100 dark:bg-blue-900/30" },
  file_download:    { label: "File download",     icon: <Download size={12} />,  color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-100 dark:bg-blue-900/30" },
  transfer_sent:    { label: "Transfer sent",     icon: <Send size={12} />,      color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30" },
  share:            { label: "File shared",       icon: <Share2 size={12} />,    color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
  link_created:     { label: "Link created",      icon: <LinkIcon size={12} />,  color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-900/30" },
  delete:           { label: "File deleted",      icon: <AlertTriangle size={12} />, color: "text-red-600 dark:text-red-400",  bg: "bg-red-100 dark:bg-red-900/30" },
  file_delete:      { label: "File deleted",      icon: <AlertTriangle size={12} />, color: "text-red-600 dark:text-red-400",  bg: "bg-red-100 dark:bg-red-900/30" },
  login:            { label: "User login",        icon: <Shield size={12} />,    color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-900/30" },
  user_created:     { label: "User created",      icon: <Users size={12} />,     color: "text-cyan-600 dark:text-cyan-400",    bg: "bg-cyan-100 dark:bg-cyan-900/30" },
  view:             { label: "File viewed",       icon: <Eye size={12} />,       color: "text-slate-600 dark:text-slate-400",  bg: "bg-slate-100 dark:bg-slate-800/60" },
};
const DEFAULT_ACTION = { label: "Activity",  icon: <Activity size={12} />, color: "text-gray-500", bg: "bg-gray-100 dark:bg-zinc-800" };

function getActionCfg(action: string) {
  return ACTION_CONFIG[action?.toLowerCase?.()] ?? DEFAULT_ACTION;
}

function actorName(item: ActivityItem) {
  return item.user?.name ?? item.actor?.name ?? item.actorName ?? "Unknown";
}
function actorEmail(item: ActivityItem) {
  return item.user?.email ?? item.actor?.email ?? item.actorEmail ?? "";
}
function resourceLabel(item: ActivityItem) {
  return item.resourceName ?? item.resource
    ?? (item.metadata?.fileName as string)
    ?? (item.metadata?.title as string)
    ?? "";
}

/* ─── Stat card ─── */
interface StatCardProps {
  title: string;
  value: string | number | undefined;
  sub?: string;
  icon: React.ReactNode;
  gradient: string;
  trend?: number;
  href?: string;
  loading?: boolean;
}

function StatCard({ title, value, sub, icon, gradient, trend, href, loading }: StatCardProps) {
  const inner = (
    <Card className="p-5 group hover:shadow-xl transition-all duration-300 cursor-default">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</p>
          {loading ? (
            <div className="mt-2.5 h-8 w-20 animate-pulse rounded-lg bg-gray-100 dark:bg-zinc-800" />
          ) : (
            <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              {value ?? "—"}
            </h2>
          )}
          {sub && !loading && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">{sub}</p>
          )}
          {trend !== undefined && !loading && (
            <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${trend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              <TrendingUp size={10} className={trend < 0 ? "rotate-180" : ""} />
              {Math.abs(trend).toFixed(1)}% this week
            </div>
          )}
        </div>
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-lg shrink-0`}>
          {icon}
        </div>
      </div>
      {href && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <span>View details</span><ArrowUpRight size={11} />
        </div>
      )}
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

/* ─── Skeleton ─── */
function StatSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
          <div className="h-7 w-16 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
          <div className="h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
        </div>
        <div className="h-11 w-11 animate-pulse rounded-xl bg-gray-100 dark:bg-zinc-800" />
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════
   PAGE
══════════════════════════════════════════ */
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  const role = user?.role?.toLowerCase();
  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperAdmin = role === "superadmin";

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<ActivityItem[]>([]);
  const [dashboardCards, setDashboardCards] = useState<AdminDashboardCard[]>([]);
  const [systemHealth, setSystemHealth] = useState<Record<string, unknown>>({});
  const [database, setDatabase] = useState<Record<string, unknown>>({});
  const [loading, setLoading]   = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (user && !isAdmin) router.replace("/dashboard");
  }, [user, isAdmin, router]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const data = await loadAdminDashboardData({ includeSuperAdminDashboard: isSuperAdmin });
      setOverview(data.overview);
      setActivity(data.recentActivity.slice(0, 15).map((item, index) => ({
        ...item,
        id: String(item.id ?? index),
        action: String(item.action ?? item.type ?? "activity"),
        createdAt: String(item.createdAt ?? new Date().toISOString()),
      })));
      setAuditLogs(data.auditLogs.slice(0, 6).map((item, index) => ({
        ...item,
        id: String(item.id ?? index),
        action: String(item.action ?? item.type ?? "activity"),
        createdAt: String(item.createdAt ?? new Date().toISOString()),
      })));
      setDashboardCards(data.cards);
      setSystemHealth(data.systemHealth);
      setDatabase(data.database);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isSuperAdmin]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load, fetchKey]);

  /* ─── Stats config ─── */
  const stats: StatCardProps[] = overview ? [
    {
      title: "Total Users",
      value: formatCompactNumber(overview.totalUsers),
      sub: `${overview.activeUsers ?? 0} active`,
      icon: <Users size={18} />,
      gradient: "from-orange-500 to-orange-600",
      trend: overview.userGrowthPct,
      href: "/admin/users",
    },
    {
      title: "Total Files",
      value: formatCompactNumber(overview.totalFiles),
      sub: `${formatCompactNumber(overview.recentUploads ?? 0)} uploaded today`,
      icon: <Files size={18} />,
      gradient: "from-blue-500 to-blue-600",
    },
    {
      title: "Storage Used",
      value: formatBytes(overview.totalStorage ?? overview.totalStorageUsed),
      sub: "Platform-wide",
      icon: <HardDrive size={18} />,
      gradient: "from-violet-500 to-violet-600",
      href: "/admin/storage",
    },
    {
      title: "Transfers",
      value: formatCompactNumber(overview.totalTransfers),
      sub: `${formatCompactNumber(overview.transfersToday ?? 0)} today`,
      icon: <Send size={18} />,
      gradient: "from-emerald-500 to-emerald-600",
    },
    {
      title: "Downloads",
      value: formatCompactNumber(overview.totalDownloads ?? overview.recentDownloads),
      sub: `${formatCompactNumber(overview.downloadsToday ?? 0)} today`,
      icon: <Download size={18} />,
      gradient: "from-cyan-500 to-cyan-600",
    },
    {
      title: "Active Links",
      value: formatCompactNumber(overview.activeLinks),
      sub: overview.totalViews !== undefined ? `${formatCompactNumber(overview.totalViews)} total views` : undefined,
      icon: <LinkIcon size={18} />,
      gradient: "from-pink-500 to-rose-600",
    },
  ] : [];

  const backendCards = dashboardCards.filter((card) =>
    ["system", "database"].includes(card.id),
  );

  /* ─── Quick links ─── */
  const quickLinks = [
    { title: "User Management", desc: "Create, edit and control user accounts", href: "/admin/users", icon: <Users size={16} />, count: overview?.totalUsers, badge: "orange" },
    { title: "Storage Reports",  desc: "Platform-wide storage analytics",      href: "/admin/storage", icon: <HardDrive size={16} />, badge: "violet" },
    { title: "Activity Log",     desc: "Complete audit trail of all actions",  href: isSuperAdmin ? "/superadmin/audit-logs" : "/admin/activity", icon: <Activity size={16} />, badge: "blue" },
    ...(isSuperAdmin
      ? [
        { title: "System Health", desc: "Runtime, services and error signals", href: "/superadmin/system", icon: <Server size={16} />, badge: "emerald" },
        { title: "Database", desc: "Collections, indexes and storage size", href: "/superadmin/database", icon: <Database size={16} />, badge: "cyan" },
      ]
      : []),
  ];

  /* ─── Platform health tiles ─── */
  const healthTiles = [
    { label: "New Users Today",   value: overview?.newUsersToday  ?? 0, icon: <Users size={14} />,    color: "text-orange-500" },
    { label: "Uploads Today",     value: overview?.recentUploads  ?? 0, icon: <Upload size={14} />,   color: "text-emerald-500" },
    { label: "Downloads Today",   value: overview?.downloadsToday ?? overview?.recentDownloads ?? 0, icon: <Download size={14} />, color: "text-blue-500" },
    { label: "Transfers Today",   value: overview?.transfersToday ?? 0, icon: <Send size={14} />,     color: "text-purple-500" },
  ];

  const now = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const systemStatus = String(systemHealth.status ?? backendCards.find((card) => card.id === "system")?.value ?? "unknown");
  const databaseStatus = String(database.status ?? backendCards.find((card) => card.id === "database")?.value ?? "unknown");
  const statusClass = (status: string) => {
    const normalized = status.toLowerCase();
    if (["healthy", "operational"].includes(normalized)) return "text-emerald-600 dark:text-emerald-400";
    if (["degraded", "warning"].includes(normalized)) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-7 pb-10">

          {/* ── Page header ── */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/15 to-amber-500/10 ring-1 ring-orange-400/30">
                  <BarChart3 size={18} className="text-orange-500" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Platform overview · {now}</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFetchKey((k) => k + 1)}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400 dark:hover:border-orange-700 dark:hover:text-orange-400"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* ── Today's pulse ── */}
          {!loading && overview && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {healthTiles.map((t) => (
                <div key={t.label} className="rounded-2xl border border-gray-200/70 bg-white px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <div className={`mb-1.5 flex items-center gap-1.5 text-xs font-medium ${t.color}`}>
                    {t.icon} {t.label}
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                    {formatCompactNumber(t.value as number)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Main stat cards ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)
              : stats.map((s, i) => <StatCard key={i} {...s} />)
            }
          </div>

          {isSuperAdmin && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <Server size={13} /> System Health
                    </div>
                    {loading ? (
                      <div className="h-7 w-28 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                    ) : (
                      <p className={`text-2xl font-bold capitalize ${statusClass(systemStatus)}`}>{systemStatus}</p>
                    )}
                    {!loading && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {Number(systemHealth.cpuUsage ?? 0)}% CPU · {Number(systemHealth.memoryUsage ?? 0)}% memory
                      </p>
                    )}
                  </div>
                  <Link href="/superadmin/system" className="rounded-xl border border-gray-200 p-2 text-gray-400 transition hover:border-orange-300 hover:text-orange-500 dark:border-zinc-800">
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <Database size={13} /> Database
                    </div>
                    {loading ? (
                      <div className="h-7 w-28 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                    ) : (
                      <p className={`text-2xl font-bold capitalize ${statusClass(databaseStatus)}`}>{databaseStatus}</p>
                    )}
                    {!loading && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatCompactNumber(Number(database.collections ?? 0))} collections · {formatBytes(Number(database.totalSize ?? 0))}
                      </p>
                    )}
                  </div>
                  <Link href="/superadmin/database" className="rounded-xl border border-gray-200 p-2 text-gray-400 transition hover:border-orange-300 hover:text-orange-500 dark:border-zinc-800">
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <ScrollText size={13} /> Audit Logs
                    </div>
                    {loading ? (
                      <div className="h-7 w-28 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                    ) : (
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCompactNumber(auditLogs.length)}</p>
                    )}
                    {!loading && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Latest privileged system events
                      </p>
                    )}
                  </div>
                  <Link href="/superadmin/audit-logs" className="rounded-xl border border-gray-200 p-2 text-gray-400 transition hover:border-orange-300 hover:text-orange-500 dark:border-zinc-800">
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </Card>
            </div>
          )}

          {/* ── Activity + Quick Actions ── */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">

            {/* Recent Activity (wider) */}
            <Card className="xl:col-span-3 overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Activity size={15} className="text-orange-500" />
                  <h2 className="font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
                </div>
                <Link href="/admin/activity" className="flex items-center gap-1 text-xs font-medium text-orange-500 hover:underline">
                  View all <ArrowUpRight size={11} />
                </Link>
              </div>

              {loading ? (
                <div className="flex h-56 items-center justify-center">
                  <Spinner size={24} />
                </div>
              ) : activity.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center gap-2 text-gray-400">
                  <Activity size={28} className="opacity-30" />
                  <p className="text-sm">No recent activity</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                  {activity.map((item, idx) => {
                    const cfg = getActionCfg(item.action ?? item.type ?? "");
                    const name = actorName(item);
                    const email = actorEmail(item);
                    const resource = resourceLabel(item);
                    return (
                      <div key={item.id ?? idx} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.bg} ${cfg.color}`}>
                          {cfg.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[120px]">{name}</span>
                            <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                            {resource && <span className="text-xs text-gray-500 truncate max-w-[120px]">{resource}</span>}
                          </div>
                          {email && <p className="text-[11px] text-gray-400 mt-0.5">{email}</p>}
                        </div>
                        <span className="shrink-0 text-[11px] whitespace-nowrap text-gray-400">{formatRelative(item.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Right column: quick links + health */}
            <div className="xl:col-span-2 space-y-4">
              {/* Quick links */}
              {quickLinks.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Card className="p-4 hover:border-orange-400/60 hover:shadow-lg transition-all duration-200 cursor-pointer mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 dark:bg-orange-900/20 dark:text-orange-400">
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">{item.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.desc}</p>
                      </div>
                      {item.count !== undefined && !loading && (
                        <span className="shrink-0 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                          {formatCompactNumber(item.count as number)}
                        </span>
                      )}
                      <ArrowUpRight size={14} className="shrink-0 text-gray-300 dark:text-zinc-600" />
                    </div>
                  </Card>
                </Link>
              ))}

              {isSuperAdmin && (
                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <ScrollText size={14} className="text-orange-500" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Audit Preview</h3>
                    </div>
                    <Link href="/superadmin/audit-logs" className="text-xs font-medium text-orange-500 hover:underline">
                      View all
                    </Link>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                    {loading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="px-5 py-3">
                          <div className="h-3 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                        </div>
                      ))
                    ) : auditLogs.length === 0 ? (
                      <div className="px-5 py-8 text-center text-xs text-gray-400">No audit logs yet</div>
                    ) : auditLogs.slice(0, 4).map((item, idx) => (
                      <div key={item.id ?? idx} className="px-5 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                              {item.message ?? item.description ?? item.action ?? item.type ?? "Audit event"}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                              {actorName(item)} {resourceLabel(item) ? `· ${resourceLabel(item)}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] text-gray-400">{formatRelative(item.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Platform summary */}
              <Card className="overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3.5 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-amber-500" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Platform Summary</h3>
                  </div>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-zinc-800/60 px-5">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex justify-between py-2.5">
                        <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                        <div className="h-3 w-12 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                      </div>
                    ))
                  ) : [
                    { label: "Total Users",     val: formatCompactNumber(overview?.totalUsers),   icon: <Users size={11} />,     color: "text-orange-500" },
                    { label: "Total Files",     val: formatCompactNumber(overview?.totalFiles),   icon: <Files size={11} />,     color: "text-blue-500" },
                    { label: "Storage Used",    val: formatBytes(overview?.totalStorage ?? overview?.totalStorageUsed), icon: <HardDrive size={11} />, color: "text-violet-500" },
                    { label: "Active Links",    val: formatCompactNumber(overview?.activeLinks),  icon: <LinkIcon size={11} />,  color: "text-pink-500" },
                    { label: "Total Downloads", val: formatCompactNumber(overview?.totalDownloads ?? overview?.recentDownloads), icon: <Download size={11} />, color: "text-cyan-500" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between py-2.5">
                      <div className={`flex items-center gap-1.5 text-xs ${r.color}`}>
                        {r.icon}
                        <span className="text-gray-600 dark:text-gray-400">{r.label}</span>
                      </div>
                      <span className="text-xs font-bold text-gray-900 dark:text-white">{r.val}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {/* ── Bottom nav cards ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                title: "User Management",
                desc: "Manage accounts, roles, and storage quotas across your team",
                href: "/admin/users",
                icon: <Users size={20} />,
                gradient: "from-orange-500/10 to-amber-500/5",
                iconColor: "text-orange-500",
              },
              {
                title: "Storage Analytics",
                desc: "Monitor platform-wide storage usage, breakdowns, and top consumers",
                href: "/admin/storage",
                icon: <FolderOpen size={20} />,
                gradient: "from-violet-500/10 to-purple-500/5",
                iconColor: "text-violet-500",
              },
              {
                title: "Audit Activity Log",
                desc: "Full audit trail of uploads, downloads, transfers and security events",
                href: isSuperAdmin ? "/superadmin/audit-logs" : "/admin/activity",
                icon: <CheckCircle2 size={20} />,
                gradient: "from-emerald-500/10 to-green-500/5",
                iconColor: "text-emerald-500",
              },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <Card className={`p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer bg-gradient-to-br ${item.gradient}`}>
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 dark:bg-zinc-900/60 shadow-sm ${item.iconColor}`}>
                    {item.icon}
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{item.desc}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-orange-500">
                    Open <ArrowUpRight size={11} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>

        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
