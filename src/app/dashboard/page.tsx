"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Activity, ArrowUpRight, BarChart3, Bell, Check, CheckCircle,
  Clock, Copy, Crown, Download, Eye, File, Folder, HardDrive,
  Inbox, Link as LinkIcon, Moon, RefreshCw, Send, Shield, Star, Sun,
  TrendingDown, TrendingUp, Upload, UserRound, Users, XCircle, Zap,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import {
  cn,
  formatBytes,
  formatRelative,
  getWorkspaceLocale,
  truncate,
  usesTwelveHourClock,
} from "@/lib/utils";
import {
  getLinksFromResponse,
  getLinkStatusCounts,
  getTransferFileCount,
  getTransferSenderEmail,
  getTransferSenderLabel,
  getTransfersFromResponse,
  getTransferTotalSize,
} from "@/lib/transfers";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Avatar, Spinner } from "@/components/ui";
import FileTypeIcon from "@/components/ui/FileTypeIcon";
import {
  adminApi, filesApi, foldersApi, linksApi, notificationsApi,
  transactionsApi, transfersApi, uploadApi, usersApi,
} from "@/lib/api";
import { handleApiError } from "@/lib/error-handler";
import { listenAppDataChanged } from "@/lib/app-events";
import { Notification, Transfer } from "@/types";
import {
  loadAdminDashboardData,
  type AdminDashboardActivity,
  type AdminDashboardOverview,
  type AdminDashboardUser,
  type AdminDashboardUserStats,
} from "@/lib/admin-dashboard";
import {
  getNotificationsFromResponse,
  getUnreadCountFromResponse,
} from "@/lib/notifications";

const CLOCK_TICK_MS = 30_000;

function getGreeting(): { label: string; icon: ReactNode } {
  const hour = new Date().getHours();
  if (hour === 0) return { label: "Hey Midnight", icon: <Moon size={13} className="text-indigo-400" /> };
  if (hour < 12) return { label: "Good Morning", icon: <Sun size={13} className="text-amber-400" /> };
  if (hour < 17) return { label: "Good Afternoon", icon: <Sun size={13} className="text-orange-400" /> };
  if (hour < 21) return { label: "Good Evening", icon: <Moon size={13} className="text-orange-300" /> };
  return { label: "Good Night", icon: <Moon size={13} className="text-blue-400" /> };
}

function getTime(): string {
  return new Date().toLocaleTimeString(getWorkspaceLocale(), {
    hour: "numeric",
    minute: "2-digit",
    hour12: usesTwelveHourClock(),
  });
}

function DashboardGreeting({ name }: { name: string }) {
  const [time, setTime] = useState("");
  const [greeting, setGreeting] = useState<{ label: string; icon: ReactNode }>({
    label: "",
    icon: null,
  });

  useEffect(() => {
    const update = () => {
      setTime(getTime());
      setGreeting(getGreeting());
    };

    update();
    const id = setInterval(update, CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (!greeting.label) return null;

  return (
    <div className="mb-5 flex items-center gap-2 text-gray-700 dark:text-gray-200">
      <span aria-hidden>{greeting.icon}</span>
      <span className="text-[13px] font-medium">
        {greeting.label}, {name}
      </span>
      <span className="text-gray-300 dark:text-zinc-600">·</span>
      <time
        suppressHydrationWarning
        className="font-mono text-[11px] tabular-nums text-gray-400 dark:text-gray-500"
      >
        {time}
      </time>
    </div>
  );
}

/* ─── Week chart helpers ─── */
function last7Labels(): string[] {
  return [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString("en", { weekday: "short" });
  });
}

function groupByDay(items: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  items.forEach((item) => {
    try {
      const d   = new Date(item.createdAt ?? item.time ?? item.date ?? "");
      const key = d.toLocaleDateString("en", { weekday: "short" });
      map[key]  = (map[key] ?? 0) + 1;
    } catch { /* skip */ }
  });
  return map;
}

function toWeekSeries(map: Record<string, number>, key: string) {
  return last7Labels().map((day) => ({ day, [key]: map[day] ?? 0 }));
}

type StorageRecord = Record<string, unknown> & {
  storage?: StorageRecord;
  summary?: StorageRecord;
};

function asStorageRecord(data: unknown): StorageRecord {
  return data && typeof data === "object" ? (data as StorageRecord) : {};
}

function readStorageUsed(data: unknown): number {
  const item = asStorageRecord(data);
  const storage = asStorageRecord(item.storage);
  const summary = asStorageRecord(item.summary);

  return (
    Number(item.usedBytes ?? storage.usedBytes ?? storage.used ?? storage.totalUsed ?? summary.totalUsedBytes ??
      summary.totalSizeBytes ?? item.totalUsedBytes ?? item.totalSizeBytes ??
      item.used ?? item.totalUsed ?? item.storageUsed) ||
    0
  );
}

function readStorageQuota(data: unknown): number {
  const item = asStorageRecord(data);
  const storage = asStorageRecord(item.storage);
  const summary = asStorageRecord(item.summary);

  return (
    Number(item.quotaBytes ?? storage.quotaBytes ?? storage.quota ?? storage.totalQuota ?? summary.totalQuotaBytes ??
      item.totalQuotaBytes ?? item.quota ?? item.totalQuota ?? item.storageQuota) ||
    0
  );
}

/* ─── Status badge ─── */
function isAdminUserActive(user: AdminDashboardUser): boolean {
  const value: unknown = user.isActive ?? user.active;
  if (typeof value === "string") return value.toLowerCase() === "true" || value === "1";
  return Boolean(value);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:    { label: "Active",    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    expired:   { label: "Expired",   cls: "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400" },
    disabled:  { label: "Disabled",  cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
    pending:   { label: "Pending",   cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500" },
    delivered: { label: "Delivered", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    opened:    { label: "Opened",    cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
    completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    uploading: { label: "Uploading", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    failed:    { label: "Failed",    cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  };
  const s = map[status?.toLowerCase()] ?? map.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

/* ─── Activity icon map ─── */
const ACTIVITY_ICONS: Record<string, ReactNode> = {
  upload:   <Upload   size={12} className="text-emerald-500" />,
  download: <Download size={12} className="text-blue-500"   />,
  share:    <Send     size={12} className="text-orange-500" />,
  delete:   <XCircle  size={12} className="text-red-400"    />,
  login:    <Shield   size={12} className="text-purple-500" />,
  view:     <Eye      size={12} className="text-gray-400"   />,
  create:   <File     size={12} className="text-teal-500"   />,
};

function activityIcon(action?: string) {
  if (!action) return <Activity size={12} className="text-gray-400" />;
  const key = Object.keys(ACTIVITY_ICONS).find((k) =>
    action.toLowerCase().includes(k),
  );
  return key ? ACTIVITY_ICONS[key] : <Activity size={12} className="text-gray-400" />;
}

/* ─── Stat card ─── */
function StatCard({
  icon, label, value, sub, trend, from, to, href, loading,
}: {
  icon: ReactNode; label: string; value: string | number;
  sub?: string; trend?: number; from: string; to: string;
  href?: string; loading?: boolean;
}) {
  const inner = (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl border border-gray-200/60 bg-white p-5 shadow-sm",
      "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg",
      "dark:border-zinc-800 dark:bg-zinc-900",
      href && "cursor-pointer",
    )}>
      <div className={`absolute right-0 top-0 h-full w-1 rounded-r-2xl bg-linear-to-b ${from} ${to} opacity-25 transition-opacity group-hover:opacity-70`} />
      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br ${from} ${to} text-white shadow-md`}>
        {icon}
      </div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      {loading ? (
        <div className="mt-1 h-7 w-20 animate-pulse rounded-lg bg-gray-200 dark:bg-zinc-800" />
      ) : (
        <h3 className="mt-0.5 text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>
      )}
      {(sub || trend !== undefined) && !loading && (
        <div className="mt-1.5 flex items-center gap-2">
          {sub && <span className="text-xs text-gray-500 dark:text-gray-400">{sub}</span>}
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
  return href ? <Link href={href}>{inner}</Link> : inner;
}

/* ─── Quick action tile ─── */
function QuickAction({ icon, label, href, color, badge }: {
  icon: ReactNode; label: string; href: string; color: string; badge?: number;
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/60 p-4 text-center transition-all hover:border-orange-400 hover:bg-orange-50/60 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:border-orange-500/60 dark:hover:bg-orange-900/10"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color} text-white shadow-sm`}>
        {icon}
      </div>
      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

/* ─── Storage bar (scaleX avoids inline-width linter flag) ─── */
function StorageBar({ used, quota, loading }: { used: number; quota: number; loading: boolean }) {
  const pct   = quota > 0 ? Math.min((used / quota) * 100, 100) : 0;
  const color = pct > 90
    ? "from-red-500 to-rose-400"
    : pct > 70
    ? "from-amber-500 to-yellow-400"
    : "from-orange-500 to-amber-400";

  if (loading) return <div className="h-3 animate-pulse rounded-full bg-gray-200 dark:bg-zinc-800" />;

  return (
    <>
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-semibold text-gray-900 dark:text-white">{formatBytes(used)}</span>
        <span className="text-gray-500">{quota > 0 ? `of ${formatBytes(quota)}` : "No quota set"}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-800">
        <div
          className={`h-full origin-left rounded-full bg-linear-to-r ${color} transition-all duration-700`}
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-gray-500">
        <span>{pct.toFixed(1)}% used</span>
        {quota > 0 && (
          <span className="text-emerald-600 dark:text-emerald-400">{formatBytes(quota - used)} free</span>
        )}
      </div>
    </>
  );
}

/* ─── Chart tooltip ─── */
function ChartTip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur-xl dark:border-zinc-700 dark:bg-zinc-900/95">
      <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-sm font-bold" style={{ color: p.color }}>
          {p.name}: {formatter ? formatter(p.value) : p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

/* ─── Section header ─── */
function SectionHead({ title, sub, href, linkLabel = "View all", icon }: {
  title: string; sub?: string; href?: string; linkLabel?: string; icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200/70 px-6 py-4 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2>
          {sub && <p className="text-xs text-gray-500">{sub}</p>}
        </div>
      </div>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-sm font-medium text-orange-500 hover:text-orange-600">
          {linkLabel} <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  );
}

/* ─── Activity item ─── */
function ActivityItem({ item, i }: { item: any; i: number }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800">
        {activityIcon(item.action ?? item.type ?? item.description)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-700 dark:text-gray-300">
          {item.description ?? item.action ?? item.message ?? "Action"}
        </p>
        <p className="mt-0.5 text-[11px] text-gray-400">
          {formatRelative(item.time ?? item.createdAt)}
        </p>
      </div>
    </div>
  );
}

function auditText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function auditTitle(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

type AuditRecord = Record<string, unknown>;

function asAuditRecord(value: unknown): AuditRecord {
  return value && typeof value === "object" ? (value as AuditRecord) : {};
}

function auditSource(log: unknown): AuditRecord {
  const root = asAuditRecord(log);
  return root.data && typeof root.data === "object" ? asAuditRecord(root.data) : root;
}

function auditCategory(log: unknown) {
  const root = asAuditRecord(log);
  const data = auditSource(log);
  const raw = auditText(root.action, root.type, data.action, data.type, data.targetType, data.resourceType).toLowerCase();
  if (raw.includes("security") || raw.includes("login") || raw.includes("otp") || raw.includes("password") || raw.includes("disabled")) return "Security";
  if (raw.includes("transfer")) return "Transfer";
  if (raw.includes("share")) return "Share";
  if (raw.includes("link")) return "Link";
  if (raw.includes("folder")) return "Folder";
  if (raw.includes("storage") || raw.includes("quota") || raw.includes("session")) return "Storage";
  if (raw.includes("user") || raw.includes("registered")) return "User";
  if (raw.includes("file") || raw.includes("upload") || raw.includes("download") || raw.includes("delete")) return "File";
  return "System";
}

function auditRisk(log: unknown) {
  const root = asAuditRecord(log);
  const data = auditSource(log);
  const text = auditText(root.action, root.type, data.action, data.type, data.status, root.status).toLowerCase();
  if (text.includes("delete") || text.includes("disabled") || text.includes("failed") || text.includes("password") || text.includes("otp")) return "high";
  if (text.includes("download") || text.includes("security") || text.includes("login") || text.includes("public")) return "medium";
  return "low";
}

function auditIcon(category: string, action: string) {
  const normalized = category.toLowerCase();
  if (normalized === "security") return <Shield size={14} className="text-red-500" />;
  if (normalized === "transfer") return <Send size={14} className="text-orange-500" />;
  if (normalized === "link" || normalized === "share") return <LinkIcon size={14} className="text-purple-500" />;
  if (normalized === "folder") return <Folder size={14} className="text-amber-500" />;
  if (normalized === "storage") return <HardDrive size={14} className="text-lime-600" />;
  if (normalized === "user") return <Users size={14} className="text-blue-500" />;
  if (normalized === "file") return activityIcon(action || "file");
  return <Activity size={14} className="text-gray-400" />;
}

function AuditLogItem({ log }: { log: unknown }) {
  const root = asAuditRecord(log);
  const data = auditSource(log);
  const metadata = asAuditRecord(root.metadata ?? data.metadata);
  const actor = asAuditRecord(data.uploadedBy ?? data.senderId ?? data.user ?? data.actor ?? root.user ?? root.actor);
  const action = auditText(root.action, root.type, data.action, data.type, "system_event").toLowerCase();
  const label = auditTitle(action);
  const category = auditCategory(log);
  const risk = auditRisk(log);
  const resource = auditText(
    data.originalName,
    data.fileName,
    data.title,
    data.name,
    root.resourceName,
    root.resource,
    metadata.fileName,
    metadata.title,
  );
  const actorName = auditText(actor.name, data.actorName, root.actorName, data.name, "System");
  const actorEmail = auditText(actor.email, data.actorEmail, root.actorEmail, data.email);
  const description = auditText(root.description, data.description) ||
    (resource ? `${actorName} ${label.toLowerCase()} - ${resource}` : `${actorName} ${label.toLowerCase()}`);
  const status = auditText(data.status, root.status, metadata.status);
  const createdAt = auditText(root.createdAt, data.createdAt, data.updatedAt);

  return (
    <div className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-red-50/40 dark:hover:bg-red-500/5">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {auditIcon(category, action)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:bg-zinc-800 dark:text-gray-300">
            {category}
          </span>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            risk === "high"
              ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              : risk === "medium"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
          )}>
            {risk}
          </span>
          {status && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {status}
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-white">
          {description}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="max-w-full truncate font-medium text-gray-600 dark:text-gray-300">
            {actorEmail || actorName || "Unknown actor"}
          </span>
          <span className="text-gray-300 dark:text-zinc-600">|</span>
          <span>{createdAt ? formatRelative(createdAt) : "Time unavailable"}</span>
          {resource && (
            <>
              <span className="text-gray-300 dark:text-zinc-600">|</span>
              <span className="max-w-full truncate">{resource}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Notification item ─── */
function NotificationItem({ n }: { n: Notification }) {
  const unread = !n.isRead;
  const detail = n.message && n.message !== n.title ? n.message : "";
  return (
    <div className={cn(
      "flex items-start gap-3 px-5 py-3 transition-colors",
      unread && "bg-orange-50/40 dark:bg-orange-900/5",
    )}>
      <div className={cn(
        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
        unread ? "bg-orange-100 dark:bg-orange-900/20" : "bg-gray-100 dark:bg-zinc-800",
      )}>
        <Bell size={12} className={unread ? "text-orange-500" : "text-gray-400"} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
          {n.title || n.message || "Notification"}
        </p>
        {detail && <p className="mt-0.5 truncate text-[11px] text-gray-500">{detail}</p>}
        <p className="mt-0.5 text-[11px] text-gray-400">{formatRelative(n.createdAt)}</p>
      </div>
      {unread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
    </div>
  );
}

/* ─── Compact file row ─── */
function personLabel(item: any) {
  const person = item?.uploadedBy ?? item?.createdBy ?? item?.owner ?? item?.user ?? item?.sender;
  if (person && typeof person === "object") {
    return person.name ?? person.email ?? "Unknown person";
  }
  return item?.uploadedByName ?? item?.createdByName ?? item?.ownerName ?? item?.userName ?? item?.senderEmail ?? "Unknown person";
}

function personEmail(item: any) {
  const person = item?.uploadedBy ?? item?.createdBy ?? item?.owner ?? item?.user ?? item?.sender;
  if (person && typeof person === "object") return person.email ?? "";
  return item?.uploadedByEmail ?? item?.createdByEmail ?? item?.ownerEmail ?? item?.email ?? "";
}

function RecentFileRow({ file }: { file: any }) {
  return (
    <Link
      href="/files"
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/60"
    >
      <FileTypeIcon
        mime={file.mimeType}
        ext={file.extension ?? file.name?.split(".").pop()}
        size={32}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
          {truncate(file.originalName ?? file.name ?? "File", 32)}
        </p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          {formatBytes(file.size ?? 0)} · {formatRelative(file.createdAt)}
        </p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-400">
          <UserRound size={10} />
          Uploaded by {personLabel(file)}
        </p>
      </div>
      <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
        {(file.extension ?? file.mimeType?.split("/")[1] ?? "—").slice(0, 6)}
      </span>
    </Link>
  );
}

function RecentFolderRow({ folder }: { folder: any }) {
  return (
    <Link
      href="/folders"
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/60"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
        <Folder size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
          {truncate(folder.name ?? "Folder", 32)}
        </p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          {(folder.fileCount ?? 0).toLocaleString()} files · {(folder.subfolderCount ?? 0).toLocaleString()} folders
        </p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-400">
          <UserRound size={10} />
          Uploaded by {personLabel(folder)}
          {personEmail(folder) ? ` · ${personEmail(folder)}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-[11px] text-gray-400">
        {formatRelative(folder.updatedAt ?? folder.createdAt)}
      </span>
    </Link>
  );
}

/* ══════════════════════════════════════════
   USER DASHBOARD
══════════════════════════════════════════ */
function UserDashboard({ name, user }: { name: string; user: any }) {
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [copied, setCopied]                   = useState(false);
  const [stats, setStats]                     = useState({
    totalTransfers: 0, activeLinks: 0, totalDownloads: 0,
    receivedMails: 0, totalFiles: 0, starred: 0,
  });
  const [storage, setStorage]                 = useState({ used: 0, quota: 0 });
  const [recentFiles, setRecentFiles]         = useState<any[]>([]);
  const [recentFolders, setRecentFolders]     = useState<any[]>([]);
  const [folderCount, setFolderCount]         = useState(0);
  const [recentTransfers, setRecentTransfers] = useState<Transfer[]>([]);
  const [received, setReceived]               = useState<Transfer[]>([]);
  const [activity, setActivity]               = useState<any[]>([]);
  const [lastLink, setLastLink]               = useState<any>(null);
  const [weekSeries, setWeekSeries]           = useState<any[]>([]);
  const [notifications, setNotifications]     = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]         = useState(0);
  const [uploadSessions, setUploadSessions]   = useState<any[]>([]);
  const currentUserId = user?.id ?? user?._id;

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true); else setLoading(true);

      const [
        statsRes, actRes, storRes, txRes, recRes, linksRes,
        filesRes, foldersRes, unreadRes, notifsRes, uploadsRes,
      ] = await Promise.allSettled([
        transfersApi.getStats(),
        transactionsApi.list({ limit: 20 }),
        usersApi.myStorage(),
        transfersApi.list({ limit: 5 }),
        transfersApi.received({ limit: 3 }),
        linksApi.list(),
        filesApi.list({ limit: 6, page: 1 }),
        foldersApi.list(),
        notificationsApi.unreadCount(),
        notificationsApi.list(),
        uploadApi.getSessions({ limit: 4 }),
      ]);

      const linkCounts = linksRes.status === "fulfilled"
        ? getLinkStatusCounts(getLinksFromResponse(linksRes.value.data))
        : null;

      if (statsRes.status === "fulfilled") {
        const d = statsRes.value.data?.data ?? statsRes.value.data ?? {};
        setStats({
          totalTransfers: d.totalTransfers ?? d.sent      ?? d.transfers ?? 0,
          activeLinks:    linkCounts?.active ?? d.activeLinks ?? d.links ?? 0,
          totalDownloads: d.totalDownloads ?? d.downloads ?? 0,
          receivedMails:  d.receivedMails  ?? d.received  ?? 0,
          totalFiles:     d.totalFiles     ?? d.files     ?? 0,
          starred:        d.starredMails   ?? d.starred ?? d.starredCount ?? 0,
        });
      } else if (linkCounts) {
        setStats((prev) => ({ ...prev, activeLinks: linkCounts.active }));
      }

      if (storRes.status === "fulfilled") {
        const d = storRes.value.data?.data ?? storRes.value.data ?? {};
        setStorage({
          used:  readStorageUsed(d),
          quota: readStorageQuota(d),
        });
      }

      if (actRes.status === "fulfilled") {
        const inner = actRes.value.data?.data ?? actRes.value.data;
        const list  = Array.isArray(inner)
          ? inner
          : (inner?.transactions ?? inner?.activity ?? inner?.items ?? []);
        const arr = Array.isArray(list) ? list : [];
        setActivity(arr.slice(0, 6));
        setWeekSeries(toWeekSeries(groupByDay(arr), "transfers"));
      }

      if (txRes.status === "fulfilled") {
        setRecentTransfers(getTransfersFromResponse(txRes.value.data));
      }

      if (recRes.status === "fulfilled") {
        setReceived(getTransfersFromResponse(recRes.value.data));
      }

      if (linksRes.status === "fulfilled") {
        const list = getLinksFromResponse(linksRes.value.data);
        setLastLink(list.find((link) => link.status === "active") ?? list[0] ?? null);
      }

      if (filesRes.status === "fulfilled") {
        const inner = filesRes.value.data?.data ?? filesRes.value.data;
        const list  = inner?.files ?? (Array.isArray(inner) ? inner : []);
        setRecentFiles(Array.isArray(list) ? list.slice(0, 6) : []);
        const total = inner?.total ?? inner?.pagination?.total ?? 0;
        if (total > 0) setStats((p) => ({ ...p, totalFiles: total }));
      }

      if (foldersRes.status === "fulfilled") {
        const inner = foldersRes.value.data?.data ?? foldersRes.value.data;
        const list  = inner?.folders ?? (Array.isArray(inner) ? inner : []);
        setRecentFolders(Array.isArray(list) ? list.slice(0, 5) : []);
        setFolderCount(
          inner?.total ?? inner?.pagination?.total ?? (Array.isArray(list) ? list.length : 0),
        );
      }

      if (unreadRes.status === "fulfilled") {
        setUnreadCount(getUnreadCountFromResponse(unreadRes.value.data));
      }

      if (notifsRes.status === "fulfilled") {
        const visibleNotifications = getNotificationsFromResponse(notifsRes.value.data, { currentUserId });
        setNotifications(visibleNotifications.slice(0, 5));
        setUnreadCount(visibleNotifications.filter((n) => !n.isRead).length);
      }

      if (uploadsRes.status === "fulfilled") {
        const inner = uploadsRes.value.data?.data ?? uploadsRes.value.data;
        const list  = inner?.sessions ?? (Array.isArray(inner) ? inner : []);
        setUploadSessions(Array.isArray(list) ? list.slice(0, 4) : []);
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  useEffect(() => {
    return listenAppDataChanged((detail) => {
      if (detail.files || detail.folders || detail.transfers || detail.storage) void load(true);
    });
  }, [load]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [load]);

  const storagePie = useMemo(() => {
    const s = {
      used:  storage.used  || readStorageUsed(user),
      quota: storage.quota || readStorageQuota(user),
    };
    if (s.quota <= 0) return [];
    return [
      { name: "Used", value: Math.min(s.used, s.quota) },
      { name: "Free", value: Math.max(s.quota - s.used, 0) },
    ];
  }, [storage, user]);

  const storageInfo = {
    used:  storage.used  || readStorageUsed(user),
    quota: storage.quota || readStorageQuota(user),
  };

  const today = new Date().toLocaleDateString("en", {
    weekday: "long", month: "long", day: "numeric",
  });

  const handleCopy = () => {
    const url = lastLink?.url ?? lastLink?.shortUrl ?? "";
    if (!url) return;
    navigator.clipboard.writeText(url).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-7">
      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-orange-500 via-orange-600 to-amber-600 p-8 shadow-xl shadow-orange-500/20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-10">
          <div className="absolute -right-12 -top-12 h-60 w-60 rounded-full bg-white" />
          <div className="absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-white" />
          <div className="absolute right-36 top-10 h-24 w-24 rounded-full bg-white" />
        </div>
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-orange-100">{today}</p>
            <h1 className="mt-1 text-3xl font-bold text-white">
              Welcome back, <span className="text-orange-100">{name}</span>!
            </h1>
            <p className="mt-2 max-w-md text-sm text-orange-100/90">
              {loading
                ? "Loading your overview…"
                : `${stats.totalFiles.toLocaleString()} files · ${folderCount.toLocaleString()} folders · ${unreadCount} notification${unreadCount !== 1 ? "s" : ""}`}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/transfers/send">
                <Button size="sm" className="border-0 bg-white/20 text-white shadow-none backdrop-blur-sm hover:bg-white/30">
                  <Send size={13} className="mr-1.5" /> New Transfer
                </Button>
              </Link>
              <Link href="/files">
                <Button size="sm" variant="ghost" className="border-white/30 text-white hover:bg-white/10">
                  <File size={13} className="mr-1.5" /> My Files
                </Button>
              </Link>
            </div>
          </div>
          {/* Mini storage widget in banner */}
          <div className="w-full rounded-2xl bg-white/15 p-4 backdrop-blur-sm sm:w-56">
            <div className="mb-3 flex items-center gap-2">
              <HardDrive size={14} className="text-orange-100" />
              <span className="text-sm font-semibold text-white">Storage</span>
            </div>
            {loading ? (
              <div className="space-y-2">
                <div className="h-2.5 animate-pulse rounded-full bg-white/20" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-white/20" />
              </div>
            ) : (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full origin-left rounded-full bg-white transition-all duration-700"
                    style={{ transform: `scaleX(${storageInfo.quota > 0 ? Math.min(storageInfo.used / storageInfo.quota, 1) : 0})` }}
                  />
                </div>
                <p className="mt-2 text-xs text-orange-100">
                  {formatBytes(storageInfo.used)} of{" "}
                  {storageInfo.quota > 0 ? formatBytes(storageInfo.quota) : "∞"} used
                </p>
                <Link href="/settings" className="mt-1.5 block text-[11px] text-orange-200 hover:text-white">
                  Manage storage →
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 8 stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard loading={loading} icon={<Send size={18} />}        label="Transfers Sent"  value={stats.totalTransfers.toLocaleString()}  sub="All time"       from="from-orange-500"  to="to-orange-600"  href="/transfers" />
        <StatCard loading={loading} icon={<File size={18} />}        label="Files Stored"    value={stats.totalFiles.toLocaleString()}       sub="In cloud"       from="from-sky-500"     to="to-blue-600"    href="/files" />
        <StatCard loading={loading} icon={<Folder size={18} />}      label="Folders"         value={folderCount.toLocaleString()}            sub="Organized"      from="from-amber-500"   to="to-yellow-500"  href="/folders" />
        <StatCard loading={loading} icon={<CheckCircle size={18} />} label="Active Links"    value={stats.activeLinks.toLocaleString()}      sub="Live"           from="from-emerald-500" to="to-green-600"   href="/links" />
        <StatCard loading={loading} icon={<Download size={18} />}    label="Downloads"       value={stats.totalDownloads.toLocaleString()}   sub="All time"       from="from-blue-500"    to="to-cyan-500"    href="/transfers" />
        <StatCard loading={loading} icon={<Inbox size={18} />}       label="Received"        value={stats.receivedMails.toLocaleString()}    sub="For you"        from="from-purple-500"  to="to-violet-600"  href="/transfers/receive" />
        <StatCard loading={loading} icon={<Star size={18} />}        label="Starred"         value={stats.starred.toLocaleString()}          sub="Favorites"      from="from-rose-500"    to="to-pink-500"    href="/starred" />
        <StatCard loading={loading} icon={<Bell size={18} />}        label="Unread"          value={unreadCount.toLocaleString()}            sub="Notifications"  from="from-teal-500"    to="to-cyan-500"    href="/notifications" />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_268px]">
        <Card glass className="overflow-hidden">
          <SectionHead
            title="Activity This Week"
            sub="7-day transfer & transaction activity"
            icon={<BarChart3 size={15} className="text-orange-400" />}
          />
          <div className="px-2 pb-4 pt-5">
            {loading ? (
              <div className="flex h-44 items-center justify-center"><Spinner size={24} /></div>
            ) : (
              <ResponsiveContainer width="100%" height={176}>
                <AreaChart data={weekSeries} margin={{ left: -20, right: 8 }}>
                  <defs>
                    <linearGradient id="uGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area
                    type="monotone" dataKey="transfers" name="Transfers"
                    stroke="#f97316" strokeWidth={2.5} fill="url(#uGrad)"
                    dot={{ r: 3, fill: "#f97316", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#f97316" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card glass className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <HardDrive size={14} className="text-orange-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Storage Usage</h3>
          </div>
          {loading ? (
            <div className="flex h-36 items-center justify-center"><Spinner size={24} /></div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {storagePie.length > 0 && (
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie
                      data={storagePie} cx="50%" cy="50%"
                      innerRadius={38} outerRadius={56}
                      startAngle={90} endAngle={-270}
                      dataKey="value" paddingAngle={3}
                    >
                      <Cell fill="#f97316" />
                      <Cell fill="#e5e7eb" />
                    </Pie>
                    <Tooltip content={<ChartTip formatter={formatBytes} />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="w-full">
                <StorageBar used={storageInfo.used} quota={storageInfo.quota} loading={false} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Quick actions ── */}
      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Quick Actions
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <QuickAction icon={<Send size={18} />}     label="Send Files"    href="/transfers/send"          color="bg-orange-500" />
          <QuickAction icon={<Upload size={18} />}   label="Upload Files"  href="/files?upload=1"          color="bg-teal-500"   />
          <QuickAction icon={<File size={18} />}     label="My Files"      href="/files"                   color="bg-sky-500"    />
          <QuickAction icon={<Folder size={18} />}   label="Folders"       href="/folders"                 color="bg-amber-500"  />
          <QuickAction icon={<LinkIcon size={18} />} label="Create Link"   href="/transfers/send?tab=link" color="bg-purple-500" />
          <QuickAction icon={<Bell size={18} />}     label="Notifications" href="/notifications"           color="bg-rose-500"   badge={unreadCount} />
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        {/* Left: Recent Files + Transfers */}
        <div className="space-y-6">
          <Card glass className="overflow-hidden">
            <SectionHead
              title="Recent Files"
              sub="Latest uploads to your cloud storage"
              href="/files"
              icon={<File size={15} className="text-sky-500" />}
            />
            {loading ? (
              <div className="flex items-center justify-center py-10"><Spinner size={24} /></div>
            ) : recentFiles.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-700">
                  <File size={22} className="text-gray-300 dark:text-zinc-600" />
                </div>
                <p className="text-sm font-medium text-gray-500">No files yet</p>
                <Link href="/files"><Button size="sm" variant="secondary">Upload Files</Button></Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-100/70 px-2 py-1 dark:divide-zinc-800/50">
                {recentFiles.map((f) => <RecentFileRow key={f.id} file={f} />)}
              </div>
            )}
          </Card>

          <Card glass className="overflow-hidden">
            <SectionHead
              title="Recent Folders"
              sub="Latest folders and nested collections"
              href="/folders"
              icon={<Folder size={15} className="text-amber-500" />}
            />
            {loading ? (
              <div className="flex items-center justify-center py-10"><Spinner size={24} /></div>
            ) : recentFolders.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-700">
                  <Folder size={22} className="text-gray-300 dark:text-zinc-600" />
                </div>
                <p className="text-sm font-medium text-gray-500">No folders yet</p>
                <Link href="/folders"><Button size="sm" variant="secondary">Open Folders</Button></Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-100/70 px-2 py-1 dark:divide-zinc-800/50">
                {recentFolders.map((folder) => <RecentFolderRow key={folder.id ?? folder._id ?? folder.name} folder={folder} />)}
              </div>
            )}
          </Card>

          <Card glass className="overflow-hidden">
            <SectionHead
              title="Recent Transfers"
              href="/transfers"
              icon={<Send size={15} className="text-orange-500" />}
            />
            {loading ? (
              <div className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200 dark:bg-zinc-800" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-40 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
                      <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-zinc-800/60" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentTransfers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-700">
                  <Send size={22} className="text-gray-300 dark:text-zinc-600" />
                </div>
                <p className="text-sm font-medium text-gray-500">No transfers yet</p>
                <Link href="/transfers/send"><Button size="sm" variant="secondary">Send Files</Button></Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                {recentTransfers.map((t) => (
                  <Link
                    key={t.id} href={`/transfers/${t.id}`}
                    className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-orange-50/40 dark:hover:bg-orange-500/5"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-500 dark:bg-orange-900/20">
                      <Send size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {t.title || `Transfer ${t.id.slice(-6)}`}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {getTransferFileCount(t)} file{getTransferFileCount(t) !== 1 ? "s" : ""}
                        {" · "}{formatBytes(getTransferTotalSize(t))}
                        {" · "}{formatRelative(t.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge status={t.status ?? "pending"} />
                      {(t.views !== undefined || t.downloads !== undefined) && (
                        <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
                          <Eye size={10} />{t.views ?? 0}
                          <Download size={10} />{t.downloads ?? 0}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Notifications */}
          <Card glass className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200/70 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-orange-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <Link href="/notifications" className="flex items-center gap-1 text-xs font-medium text-orange-500 hover:text-orange-600">
                View all <ArrowUpRight size={11} />
              </Link>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
            ) : notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">All caught up!</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                {notifications.map((n, i) => <NotificationItem key={n.id ?? i} n={n} />)}
              </div>
            )}
          </Card>

          {/* Received */}
          <Card glass className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200/70 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Inbox size={15} className="text-blue-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Received Items</h3>
              </div>
              <Link href="/transfers/receive" className="text-xs font-medium text-orange-500 hover:text-orange-600">
                View all
              </Link>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
            ) : received.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No received transfers</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                {received.map((r) => (
                  <Link key={r.id} href={`/transfers/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-500/5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-500 dark:bg-blue-900/20">
                      <Inbox size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {r.title || `Transfer ${r.id.slice(-6)}`}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {getTransferSenderEmail(r) ?? getTransferSenderLabel(r)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {formatRelative(r.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Last Active Link */}
          <Card glass className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <LinkIcon size={14} className="text-purple-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Last Active Link</h3>
            </div>
            {loading ? (
              <div className="space-y-2">
                <div className="h-9 animate-pulse rounded-xl bg-gray-200 dark:bg-zinc-800" />
                <div className="h-4 w-32 animate-pulse rounded bg-gray-100 dark:bg-zinc-800/60" />
              </div>
            ) : lastLink ? (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800">
                  <span className="flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
                    {lastLink.url ?? lastLink.shortUrl ?? lastLink.link ?? "—"}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    aria-label="Copy link"
                    className="shrink-0 text-gray-400 transition-colors hover:text-orange-500"
                  >
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Eye size={10} /> {lastLink.views ?? lastLink.viewCount ?? 0} views</span>
                  <span className="flex items-center gap-1"><Download size={10} /> {lastLink.downloads ?? lastLink.downloadCount ?? 0} dl</span>
                  {lastLink.expiresAt && (
                    <span className="flex items-center gap-1 text-amber-500">
                      <Clock size={10} /> {formatRelative(lastLink.expiresAt)}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <p className="text-sm text-gray-400">No active links</p>
                <Link href="/transfers/send?tab=link">
                  <Button size="xs" variant="ghost">Create one</Button>
                </Link>
              </div>
            )}
          </Card>

          {/* Upload Sessions or Activity fallback */}
          {uploadSessions.length > 0 ? (
            <Card glass className="overflow-hidden">
              <div className="flex items-center border-b border-gray-200/70 px-5 py-4 dark:border-zinc-800">
                <Upload size={14} className="mr-2 text-teal-500" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Uploads</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                {uploadSessions.map((s, i) => (
                  <div key={s.id ?? i} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-900/20">
                      <Upload size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {s.fileName ?? s.originalName ?? s.key?.split("/").pop() ?? "Upload"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatBytes(s.fileSize ?? s.size ?? 0)} · {formatRelative(s.createdAt)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-400">
                        <UserRound size={10} />
                        Uploaded by {personLabel(s)}
                      </p>
                    </div>
                    <StatusBadge status={s.status ?? "completed"} />
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card glass className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-200/70 px-5 py-4 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-orange-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
                </div>
                <Link href="/transactions" className="text-xs font-medium text-orange-500 hover:text-orange-600">
                  View all
                </Link>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
              ) : activity.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No recent activity</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                  {activity.map((a, i) => <ActivityItem key={a.id ?? i} item={a} i={i} />)}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   ADMIN DASHBOARD
══════════════════════════════════════════ */
function AdminDashboard({ name }: { name: string }) {
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [overview, setOverview]             = useState<AdminDashboardOverview>({
    totalUsers: 0,
    activeUsers: 0,
    totalFiles: 0,
    totalTransfers: 0,
    activeLinks: 0,
    expiredLinks: 0,
    disabledLinks: 0,
    totalDownloads: 0,
    totalViews: 0,
    totalStorage: 0,
    storageQuota: 0,
    recentUploads: 0,
    recentDownloads: 0,
    newUsersToday: 0,
    transfersToday: 0,
    downloadsToday: 0,
  });
  const [userStats, setUserStats]           = useState<AdminDashboardUserStats>({
    total: 0,
    active: 0,
    inactive: 0,
    byRole: { admin: 0, user: 0, superadmin: 0 },
  });
  const [storage, setStorage]               = useState({ used: 0, quota: 0 });
  const [teamUsers, setTeamUsers]           = useState<AdminDashboardUser[]>([]);
  const [recentActivity, setRecentActivity] = useState<AdminDashboardActivity[]>([]);
  const [weekSeries, setWeekSeries]         = useState<any[]>([]);
  const [unreadCount, setUnreadCount]       = useState(0);
  const [failedSources, setFailedSources]   = useState<string[]>([]);

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true); else setLoading(true);
      const data = await loadAdminDashboardData();
      setOverview(data.overview);
      setUserStats(data.userStats);
      setStorage(data.storage);
      setTeamUsers(data.teamUsers);
      setRecentActivity(data.recentActivity);
      setWeekSeries(toWeekSeries(groupByDay(data.recentActivity), "actions"));
      setUnreadCount(data.unreadCount);
      setFailedSources(data.failedSources);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const storageChart = useMemo(
    () =>
      teamUsers
        .filter((u) => readStorageUsed(u) > 0)
        .sort((a, b) => readStorageUsed(b) - readStorageUsed(a))
        .slice(0, 6)
        .map((u) => ({
          name:    (u.name ?? u.email ?? "User").split(/\s+/)[0],
          storage: readStorageUsed(u),
        })),
    [teamUsers],
  );

  const ov = overview;
  const us = userStats;

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-[rgb(62,120,1)] via-[rgb(73,140,1)] to-lime-600 p-5 shadow-xl shadow-green-700/20 sm:rounded-3xl sm:p-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-10">
          <div className="absolute -right-12 -top-12 h-60 w-60 rounded-full bg-white" />
          <div className="absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-white" />
        </div>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
                <Crown size={11} /> Admin Panel
              </span>
              {!loading && (
                <span
                  title={failedSources.length === 0 ? "All admin dashboard data sources loaded" : `Unavailable: ${failedSources.join(", ")}`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${failedSources.length === 0 ? "bg-white/20 text-white ring-white/25" : "bg-orange-400/20 text-orange-50 ring-orange-200/30"}`}
                >
                  {failedSources.length === 0 ? <CheckCircle size={11} /> : <XCircle size={11} />}
                  {failedSources.length === 0 ? "All data connected" : `${failedSources.length} source${failedSources.length !== 1 ? "s" : ""} unavailable`}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              Team Overview, <span className="text-lime-100">{name}</span>
            </h1>
            <p className="mt-1.5 max-w-lg text-sm text-white/80">
              {loading
                ? "Loading team stats…"
                : `${(ov.totalUsers ?? us.total ?? 0).toLocaleString()} members · ${(ov.totalTransfers ?? 0).toLocaleString()} transfers · ${formatBytes(storage.used)} used`}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              className="w-full justify-center sm:w-auto" variant="secondary" size="sm"
              leftIcon={<RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />}
              onClick={() => load(true)}
              disabled={refreshing || loading}
            >
              Refresh
            </Button>
            <Link href="/admin/users" className="w-full sm:w-auto">
              <Button fullWidth leftIcon={<Users size={15} />} className="rounded-xl border-0 bg-white/20 text-white shadow-none backdrop-blur-sm hover:bg-white/30">
                Manage Team
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── 6 stat cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard loading={loading} icon={<Users size={18} />}       label="Total Members"  value={(ov.totalUsers ?? us.total ?? 0).toLocaleString()}                   sub="All accounts"   from="from-[rgb(73,140,1)]" to="to-lime-600" href="/admin/users" />
        <StatCard loading={loading} icon={<Activity size={18} />}    label="Active Users"   value={(us.active ?? ov.activeUsers ?? 0).toLocaleString()}                  sub="Online/active"  from="from-emerald-500" to="to-green-600"   href="/admin/users" />
        <StatCard loading={loading} icon={<Send size={18} />}        label="Team Transfers" value={(ov.totalTransfers ?? 0).toLocaleString()}                            sub="All time"       from="from-orange-500"  to="to-amber-500"   href="/admin" />
        <StatCard loading={loading} icon={<CheckCircle size={18} />} label="Active Links"   value={(ov.activeLinks ?? 0).toLocaleString()}                              sub="Across team"    from="from-lime-500" to="to-green-600" href="/admin/links" />
        <StatCard loading={loading} icon={<Download size={18} />}    label="Downloads"      value={(ov.totalDownloads ?? ov.recentDownloads ?? 0).toLocaleString()}      sub="All time"       from="from-[rgb(73,140,1)]" to="to-emerald-600" href="/admin" />
        <StatCard loading={loading} icon={<Bell size={18} />}        label="Notifications"  value={unreadCount.toLocaleString()}                                        sub="Unread"         from="from-orange-500" to="to-amber-500" href="/notifications" />
      </div>

      {/* ── User role breakdown ── */}
      {!loading && (us.active !== undefined || us.total !== undefined) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="rounded-2xl border border-green-200 bg-green-50/60 p-4 dark:border-green-800/40 dark:bg-green-900/10">
            <div className="mb-1.5 flex items-center gap-2">
              <Shield size={13} className="text-[rgb(73,140,1)]" />
              <span className="text-xs font-semibold text-[rgb(62,120,1)] dark:text-lime-400">Admins</span>
            </div>
	            <p className="text-2xl font-bold text-[rgb(62,120,1)] dark:text-lime-300">
	              {us.byRole.admin.toLocaleString()}
	            </p>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 dark:border-orange-800/40 dark:bg-orange-900/10">
            <div className="mb-1.5 flex items-center gap-2">
              <Users size={13} className="text-orange-500" />
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Regular Users</span>
            </div>
	            <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
	              {us.byRole.user.toLocaleString()}
	            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <div className="mb-1.5 flex items-center gap-2">
              <XCircle size={13} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-500">Inactive</span>
            </div>
	            <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
	              {us.inactive.toLocaleString()}
	            </p>
          </div>
        </div>
      )}

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card glass className="overflow-hidden">
          <SectionHead
            title="Team Activity (7 Days)"
            sub="Actions performed across the team"
            icon={<Activity size={15} className="text-[rgb(73,140,1)]" />}
          />
          <div className="px-2 pb-4 pt-5">
            {loading ? (
              <div className="flex h-44 items-center justify-center"><Spinner size={24} /></div>
            ) : (
              <ResponsiveContainer width="100%" height={176}>
                <LineChart data={weekSeries} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Line
                    type="monotone" dataKey="actions" name="Actions"
                    stroke="#498c01" strokeWidth={2.5}
                    dot={{ r: 3, fill: "#498c01", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card glass className="overflow-hidden">
          <SectionHead
            title="Storage by Member"
            sub="Top 6 users by storage used"
            icon={<HardDrive size={15} className="text-orange-500" />}
          />
          <div className="px-2 pb-4 pt-5">
            {loading ? (
              <div className="flex h-44 items-center justify-center"><Spinner size={24} /></div>
            ) : storageChart.length === 0 ? (
              <div className="flex h-44 items-center justify-center text-sm text-gray-400">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={176}>
                <BarChart data={storageChart} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatBytes(v)} />
                  <Tooltip content={<ChartTip formatter={formatBytes} />} />
                  <Bar dataKey="storage" name="Storage" fill="#498c01" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ── Team storage ── */}
      <Card glass className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive size={15} className="text-[rgb(73,140,1)]" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Team Storage Usage</h3>
          </div>
          <Link href="/admin/storage" className="flex items-center gap-1 text-sm text-[rgb(73,140,1)] hover:text-[rgb(62,120,1)]">
            Manage <ArrowUpRight size={13} />
          </Link>
        </div>
        <StorageBar used={storage.used} quota={storage.quota} loading={loading} />
      </Card>

      {/* ── Team table + activity ── */}
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card glass className="overflow-hidden">
          <SectionHead title="Team Members" href="/admin/users" linkLabel="Manage" />
          {loading ? (
            <div className="flex items-center justify-center py-12"><Spinner size={24} /></div>
          ) : teamUsers.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No team members found</p>
          ) : (
            <>
              <div className="divide-y divide-gray-100 sm:hidden dark:divide-zinc-800">
                {teamUsers.map((u) => (
                  <article key={u.id ?? u.email} className="min-w-0 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={u.name ?? u.email ?? "U"} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{u.name ?? "Unknown user"}</p>
                        <p className="truncate text-xs text-gray-500">{u.email}</p>
                      </div>
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isAdminUserActive(u) ? "bg-emerald-500" : "bg-gray-400"}`} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-green-50 p-2 dark:bg-green-950/20">
                        <p className="text-[10px] text-gray-500">Storage</p>
                        <p className="mt-0.5 truncate text-xs font-bold text-[rgb(62,120,1)] dark:text-lime-400">{formatBytes(readStorageUsed(u))}</p>
                      </div>
                      <div className="rounded-xl bg-orange-50 p-2 dark:bg-orange-950/20">
                        <p className="text-[10px] text-gray-500">Transfers</p>
                        <p className="mt-0.5 text-xs font-bold text-orange-600 dark:text-orange-400">{(u.transferCount ?? u.transfers ?? 0).toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-2 dark:bg-zinc-800">
                        <p className="text-[10px] text-gray-500">Role</p>
                        <p className="mt-0.5 truncate text-xs font-bold capitalize text-gray-700 dark:text-gray-300">{u.role ?? "user"}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-160 text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">User</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Storage</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Transfers</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                  {teamUsers.map((u) => (
                    <tr key={u.id ?? u.email} className="transition-colors hover:bg-green-50/50 dark:hover:bg-green-500/5">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name ?? u.email ?? "U"} size={32} />
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{u.name ?? "—"}</p>
                            <p className="text-xs text-gray-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs tabular-nums text-gray-500">
                        {formatBytes(readStorageUsed(u))}
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs tabular-nums text-gray-500">
                        {(u.transferCount ?? u.transfers ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          (u.role ?? "user") === "admin"
                            ? "bg-green-100 text-[rgb(62,120,1)] dark:bg-green-900/30 dark:text-lime-400"
                            : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400",
                        )}>
                          {u.role ?? "user"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-block h-2 w-2 rounded-full ${isAdminUserActive(u) ? "bg-emerald-500" : "bg-gray-400"}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </Card>

        <Card glass className="overflow-hidden">
          <div className="border-b border-gray-200/70 px-5 py-4 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-[rgb(73,140,1)]" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Team Activity</h3>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
          ) : recentActivity.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No recent activity</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-zinc-800/70">
              {recentActivity.map((a, i) => <ActivityItem key={a.id ?? i} item={a} i={i} />)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SUPER ADMIN DASHBOARD
══════════════════════════════════════════ */
function SuperAdminDashboard({ name }: { name: string }) {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview]     = useState<any>({});
  const [userStats, setUserStats]   = useState<any>({});
  const [storage, setStorage]       = useState({ used: 0, quota: 0 });
  const [topUsers, setTopUsers]     = useState<any[]>([]);
  const [auditLog, setAuditLog]     = useState<any[]>([]);
  const [weekSeries, setWeekSeries] = useState<any[]>([]);
  const [notifStats, setNotifStats] = useState<any>({});

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true); else setLoading(true);

      const [ovRes, storRes, usersRes, actRes, statsRes, notifRes, adminLinksRes, allLinksRes, transfersRes] =
        await Promise.allSettled([
          adminApi.overview(),
          adminApi.storage(),
          adminApi.users({ limit: 8 }),
          adminApi.auditLogs({ limit: 50 }),
          usersApi.adminStats(),
          notificationsApi.adminStats(),
          adminApi.links(),
          linksApi.adminList(),
          adminApi.transfers({ limit: 100 }),
        ]);

      const adminLinks = adminLinksRes.status === "fulfilled" ? getLinksFromResponse(adminLinksRes.value.data) : [];
      const allLinks = allLinksRes.status === "fulfilled" ? getLinksFromResponse(allLinksRes.value.data) : [];
      const transferLinks = transfersRes.status === "fulfilled"
        ? getTransfersFromResponse(transfersRes.value.data)
          .map((transfer) => transfer.link)
          .filter((link): link is NonNullable<typeof link> => Boolean(link?.status))
        : [];
      const hasLinkCountSource =
        adminLinksRes.status === "fulfilled" ||
        allLinksRes.status === "fulfilled" ||
        transfersRes.status === "fulfilled";
      const linkCounts = hasLinkCountSource
        ? getLinkStatusCounts([...adminLinks, ...allLinks, ...transferLinks])
        : null;

      if (ovRes.status === "fulfilled") {
        const d = ovRes.value.data?.data ?? ovRes.value.data ?? {};
        setOverview({
          ...d,
          activeLinks: linkCounts?.active ?? d.activeLinks,
          expiredLinks: linkCounts?.expired ?? d.expiredLinks,
          disabledLinks: linkCounts?.disabled ?? d.disabledLinks,
        });
      }
      if (storRes.status === "fulfilled") {
        const d = storRes.value.data?.data ?? storRes.value.data ?? {};
        setStorage({
          used:  readStorageUsed(d),
          quota: readStorageQuota(d),
        });
      }
      if (usersRes.status === "fulfilled") {
        const inner = usersRes.value.data?.data ?? usersRes.value.data;
        const list  = inner?.users ?? (Array.isArray(inner) ? inner : []);
        setTopUsers(Array.isArray(list) ? list.slice(0, 8) : []);
      }
      if (actRes.status === "fulfilled") {
        const inner = actRes.value.data?.data ?? actRes.value.data;
        const list  = inner?.activities ?? inner?.activity ?? inner?.events ?? inner?.items ?? (Array.isArray(inner) ? inner : []);
        const arr   = Array.isArray(list) ? list : [];
        setAuditLog(arr.slice(0, 8));
        setWeekSeries(toWeekSeries(groupByDay(arr), "events"));
      }
      if (statsRes.status === "fulfilled") {
        const d = statsRes.value.data?.data ?? statsRes.value.data ?? {};
        setUserStats(d);
      }
      if (notifRes.status === "fulfilled") {
        const d = notifRes.value.data?.data ?? notifRes.value.data ?? {};
        setNotifStats(d);
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const s  = overview;
  const us = userStats;

  const linkPie = useMemo(() => [
    { name: "Active",   value: s.activeLinks   ?? 0, color: "#10b981" },
    { name: "Expired",  value: s.expiredLinks  ?? 0, color: "#9ca3af" },
    { name: "Disabled", value: s.disabledLinks ?? 0, color: "#ef4444" },
  ].filter((d) => d.value > 0), [s.activeLinks, s.expiredLinks, s.disabledLinks]);

  const storageChart = useMemo(
    () =>
      topUsers
        .filter((u) => readStorageUsed(u) > 0)
        .slice(0, 6)
        .map((u, i) => ({
          name:    (u.name ?? u.email ?? "User").split(/\s+/)[0],
          storage: readStorageUsed(u),
          color:   `hsl(${(i * 53 + 15) % 360}, 65%, 52%)`,
        })),
    [topUsers],
  );

  return (
    <div className="space-y-7">
      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-red-600 via-red-700 to-orange-600 p-8 shadow-xl shadow-red-500/20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-10">
          <div className="absolute -right-12 -top-12 h-60 w-60 rounded-full bg-white" />
          <div className="absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-white" />
          <div className="absolute right-36 top-10 h-24 w-24 rounded-full bg-white" />
        </div>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
              <Shield size={11} /> Super Admin
            </div>
            <h1 className="text-3xl font-bold text-white">
              Platform Overview, <span className="text-red-100">{name}</span>
            </h1>
            <p className="mt-1.5 max-w-lg text-sm text-red-100/90">
              {loading
                ? "Loading platform stats…"
                : `${(s.totalUsers ?? us.total ?? 0).toLocaleString()} users · ${(s.totalTransfers ?? 0).toLocaleString()} transfers · ${formatBytes(storage.used)} stored`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary" size="sm"
              leftIcon={<RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />}
              onClick={() => load(true)}
              disabled={refreshing || loading}
            >
              Refresh
            </Button>
            <Link href="/profile">
              <Button leftIcon={<Shield size={15} />} className="rounded-xl border-0 bg-white/20 text-white shadow-none backdrop-blur-sm hover:bg-white/30">
                Super Admin
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Primary stats ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard loading={loading} icon={<Users size={20} />}     label="Total Users"     value={(s.totalUsers ?? us.total ?? 0).toLocaleString()}                    from="from-red-500"    to="to-rose-600"    href="/admin/users" />
        <StatCard loading={loading} icon={<Send size={20} />}      label="Total Transfers" value={(s.totalTransfers ?? 0).toLocaleString()}                            from="from-orange-500" to="to-amber-500"   href="/admin" />
        <StatCard loading={loading} icon={<HardDrive size={20} />} label="Total Storage"   value={formatBytes(s.totalStorage ?? storage.used ?? 0)} sub="All users"   from="from-purple-500" to="to-violet-600"  href="/admin/storage" />
        <StatCard loading={loading} icon={<Download size={20} />}  label="Total Downloads" value={(s.totalDownloads ?? s.recentDownloads ?? 0).toLocaleString()}       from="from-blue-500"   to="to-cyan-500"    href="/admin" />
      </div>

      {/* ── Secondary metrics grid ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800/40 dark:bg-emerald-900/10">
          <div className="mb-1.5 flex items-center gap-1.5">
            <CheckCircle size={13} className="text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Active Links</span>
          </div>
          {loading ? <div className="h-8 animate-pulse rounded-lg bg-emerald-100 dark:bg-emerald-800/30" /> :
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{(s.activeLinks ?? 0).toLocaleString()}</p>}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Clock size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-500">Expired Links</span>
          </div>
          {loading ? <div className="h-8 animate-pulse rounded-lg bg-gray-200 dark:bg-zinc-700" /> :
            <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{(s.expiredLinks ?? 0).toLocaleString()}</p>}
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-800/40 dark:bg-red-900/10">
          <div className="mb-1.5 flex items-center gap-1.5">
            <XCircle size={13} className="text-red-400" />
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">Disabled Links</span>
          </div>
          {loading ? <div className="h-8 animate-pulse rounded-lg bg-red-100 dark:bg-red-800/30" /> :
            <p className="text-2xl font-bold text-red-600 dark:text-red-300">{(s.disabledLinks ?? 0).toLocaleString()}</p>}
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-800/40 dark:bg-blue-900/10">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Shield size={13} className="text-blue-500" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">Admins</span>
          </div>
          {loading ? <div className="h-8 animate-pulse rounded-lg bg-blue-100 dark:bg-blue-800/30" /> :
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{(us.byRole?.admin ?? us.admin ?? 0).toLocaleString()}</p>}
        </div>
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 dark:border-teal-800/40 dark:bg-teal-900/10">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Users size={13} className="text-teal-500" />
            <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">Active Users</span>
          </div>
          {loading ? <div className="h-8 animate-pulse rounded-lg bg-teal-100 dark:bg-teal-800/30" /> :
            <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{(us.active ?? s.activeUsers ?? 0).toLocaleString()}</p>}
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800/40 dark:bg-amber-900/10">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Bell size={13} className="text-amber-500" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Notifications</span>
          </div>
          {loading ? <div className="h-8 animate-pulse rounded-lg bg-amber-100 dark:bg-amber-800/30" /> :
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{(notifStats.total ?? notifStats.unread ?? 0).toLocaleString()}</p>}
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_268px]">
        <Card glass className="overflow-hidden">
          <SectionHead
            title="Platform Activity (7 Days)"
            sub="System-wide events across all users"
            icon={<Zap size={15} className="text-red-400" />}
          />
          <div className="px-2 pb-4 pt-5">
            {loading ? (
              <div className="flex h-44 items-center justify-center"><Spinner size={24} /></div>
            ) : (
              <ResponsiveContainer width="100%" height={176}>
                <AreaChart data={weekSeries} margin={{ left: -20, right: 8 }}>
                  <defs>
                    <linearGradient id="saGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area
                    type="monotone" dataKey="events" name="Events"
                    stroke="#ef4444" strokeWidth={2.5} fill="url(#saGrad)"
                    dot={{ r: 3, fill: "#ef4444", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#ef4444" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card glass className="p-6">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Link Status</h3>
          {loading ? (
            <div className="flex h-44 items-center justify-center"><Spinner size={24} /></div>
          ) : linkPie.length > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={linkPie} cx="50%" cy="50%"
                    innerRadius={38} outerRadius={58}
                    startAngle={90} endAngle={-270}
                    dataKey="value" paddingAngle={3}
                  >
                    {linkPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex w-full flex-col gap-1.5">
                {linkPie.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                      <span className="text-gray-600 dark:text-gray-400">{d.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-white">{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-44 items-center justify-center text-sm text-gray-400">No link data</div>
          )}
        </Card>
      </div>

      {/* ── Storage by user bar ── */}
      <Card glass className="overflow-hidden">
        <SectionHead
          title="Storage by User"
          sub="Top 6 users by storage consumed"
          href="/admin/storage"
          linkLabel="Manage"
          icon={<HardDrive size={15} className="text-red-400" />}
        />
        <div className="px-4 pb-6 pt-5">
          {loading ? (
            <div className="flex h-44 items-center justify-center"><Spinner size={24} /></div>
          ) : storageChart.length === 0 ? (
            <div className="flex h-44 items-center justify-center text-sm text-gray-400">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={176}>
              <BarChart data={storageChart} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatBytes(v)} />
                <Tooltip content={<ChartTip formatter={formatBytes} />} />
                <Bar dataKey="storage" name="Storage" radius={[6, 6, 0, 0]}>
                  {storageChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* ── Platform storage ── */}
      <Card glass className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive size={15} className="text-red-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Platform Storage</h3>
          </div>
          <Link href="/admin/storage" className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600">
            Manage <ArrowUpRight size={13} />
          </Link>
        </div>
        <StorageBar used={storage.used} quota={storage.quota} loading={loading} />
      </Card>

      {/* ── Top users + audit log ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card glass className="overflow-hidden">
          <SectionHead title="Top Users by Storage" href="/admin/users" />
          {loading ? (
            <div className="flex items-center justify-center py-12"><Spinner size={24} /></div>
          ) : topUsers.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">User</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Storage</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Transfers</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                  {topUsers.map((u, i) => (
                    <tr key={u.id ?? u.email} className="transition-colors hover:bg-red-50/40 dark:hover:bg-red-500/5">
                      <td className="px-6 py-3.5 text-sm font-bold text-gray-300 dark:text-zinc-600">#{i + 1}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name ?? u.email ?? "U"} size={30} />
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{u.name ?? "—"}</p>
                            <p className="text-xs text-gray-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs tabular-nums text-gray-500">
                        {formatBytes(readStorageUsed(u))}
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs tabular-nums text-gray-500">
                        {(u.transferCount ?? u.transfers ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          (u.role ?? "user") === "superadmin"
                            ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                            : (u.role ?? "user") === "admin"
                            ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400",
                        )}>
                          {u.role ?? "user"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card glass className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-200/70 px-5 py-4 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Shield size={13} className="text-red-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Audit Log</h3>
            </div>
            <Link href="/superadmin/audit-logs" className="text-xs font-medium text-red-500 hover:text-red-600">View all</Link>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
          ) : auditLog.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No audit entries</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-zinc-800/70">
              {auditLog.map((log, i) => <AuditLogItem key={log.id ?? log._id ?? i} log={log} />)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   PAGE ENTRY
══════════════════════════════════════════ */
export default function DashboardPage() {
  const { user } = useAuth();
  const role      = (user?.role ?? "user").toLowerCase();
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in pb-10">
          <DashboardGreeting name={firstName} />
          {role === "superadmin" ? (
            <SuperAdminDashboard name={firstName} />
          ) : role === "admin" ? (
            <AdminDashboard name={firstName} />
          ) : (
            <UserDashboard name={firstName} user={user} />
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
