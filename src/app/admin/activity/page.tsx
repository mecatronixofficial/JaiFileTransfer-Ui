"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  FileText,
  Filter,
  FolderOpen,
  Globe2,
  Link as LinkIcon,
  Mail,
  MapPin,
  Monitor,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Shield,
  Smartphone,
  Upload,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";

import AuthGuard from "@/components/auth/AuthGuard";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Avatar, Badge, EmptyState, Spinner } from "@/components/ui";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { adminApi } from "@/lib/api";
import { handleApiError } from "@/lib/error-handler";
import { cn, formatBytes, formatDateTime, formatRelative } from "@/lib/utils";

type AuditCategory =
  | "file"
  | "folder"
  | "transfer"
  | "share"
  | "link"
  | "user"
  | "security"
  | "storage"
  | "system";

type ShareMethod = "link" | "qr" | "email" | "private" | "system";
type RiskLevel = "low" | "medium" | "high";

interface AuditEvent {
  id: string;
  action: string;
  label: string;
  description: string;
  category: AuditCategory;
  method: ShareMethod;
  risk: RiskLevel;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  actorIp?: string;
  device?: string;
  browser?: string;
  location?: string;
  resourceName?: string;
  resourceType?: string;
  resourceId?: string;
  resourceSize?: number;
  status?: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

type FilterCategory = "all" | AuditCategory;
type FilterMethod = "all" | ShareMethod;
type FilterRisk = "all" | RiskLevel;

const PAGE_SIZE = 20;

const CATEGORY_TABS: { value: FilterCategory; label: string; icon: React.ReactNode }[] = [
  { value: "all", label: "All", icon: <Activity size={13} /> },
  { value: "file", label: "Files", icon: <FileText size={13} /> },
  { value: "transfer", label: "Transfers", icon: <Send size={13} /> },
  { value: "link", label: "Links", icon: <LinkIcon size={13} /> },
  { value: "share", label: "Shares", icon: <Globe2 size={13} /> },
  { value: "user", label: "Users", icon: <Users size={13} /> },
  { value: "security", label: "Security", icon: <Shield size={13} /> },
  { value: "storage", label: "Storage", icon: <Database size={13} /> },
];

const METHOD_OPTIONS: { value: FilterMethod; label: string; icon: React.ReactNode }[] = [
  { value: "all", label: "All modes", icon: <Filter size={13} /> },
  { value: "link", label: "Link", icon: <LinkIcon size={13} /> },
  { value: "qr", label: "QR", icon: <QrCode size={13} /> },
  { value: "email", label: "Email", icon: <Mail size={13} /> },
  { value: "private", label: "Private", icon: <Shield size={13} /> },
];

const CATEGORY_STYLE: Record<AuditCategory, { icon: React.ReactNode; label: string; tone: string; badge: "default" | "success" | "warning" | "danger" | "info" }> = {
  file: { icon: <Upload size={14} />, label: "File", tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", badge: "success" },
  folder: { icon: <FolderOpen size={14} />, label: "Folder", tone: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20", badge: "info" },
  transfer: { icon: <Send size={14} />, label: "Transfer", tone: "bg-orange-500/10 text-orange-600 border-orange-500/20", badge: "warning" },
  share: { icon: <Globe2 size={14} />, label: "Share", tone: "bg-blue-500/10 text-blue-600 border-blue-500/20", badge: "info" },
  link: { icon: <LinkIcon size={14} />, label: "Link", tone: "bg-violet-500/10 text-violet-600 border-violet-500/20", badge: "default" },
  user: { icon: <UserPlus size={14} />, label: "User", tone: "bg-sky-500/10 text-sky-600 border-sky-500/20", badge: "info" },
  security: { icon: <Shield size={14} />, label: "Security", tone: "bg-red-500/10 text-red-600 border-red-500/20", badge: "danger" },
  storage: { icon: <Database size={14} />, label: "Storage", tone: "bg-lime-500/10 text-lime-700 border-lime-500/20", badge: "success" },
  system: { icon: <Activity size={14} />, label: "System", tone: "bg-gray-500/10 text-gray-600 border-gray-500/20", badge: "default" },
};

const METHOD_ICON: Record<ShareMethod, React.ReactNode> = {
  link: <LinkIcon size={12} />,
  qr: <QrCode size={12} />,
  email: <Mail size={12} />,
  private: <Shield size={12} />,
  system: <Activity size={12} />,
};

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getCategory(action: string, rawType: string, data: Record<string, unknown>): AuditCategory {
  const haystack = `${action} ${rawType} ${readString(data.targetType, data.resourceType)}`.toLowerCase();
  if (haystack.includes("security") || haystack.includes("login") || haystack.includes("otp") || haystack.includes("password") || haystack.includes("disabled")) return "security";
  if (haystack.includes("transfer")) return "transfer";
  if (haystack.includes("share")) return "share";
  if (haystack.includes("link")) return "link";
  if (haystack.includes("folder")) return "folder";
  if (haystack.includes("storage") || haystack.includes("quota") || haystack.includes("upload_session")) return "storage";
  if (haystack.includes("user") || haystack.includes("registered") || haystack.includes("created")) return "user";
  if (haystack.includes("file") || haystack.includes("upload") || haystack.includes("download") || haystack.includes("delete")) return "file";
  return "system";
}

function getMethod(action: string, data: Record<string, unknown>, metadata: Record<string, unknown>): ShareMethod {
  const raw = readString(
    data.method,
    metadata.method,
    metadata.shareMethod,
    metadata.transferMethod,
    data.type,
  ).toLowerCase();
  if (raw.includes("qr")) return "qr";
  if (raw.includes("email")) return "email";
  if (raw.includes("private")) return "private";
  if (raw.includes("link")) return "link";
  if (action.includes("transfer") || action.includes("share") || action.includes("link")) return "link";
  return "system";
}

function getRisk(action: string, category: AuditCategory, status?: string, method?: ShareMethod): RiskLevel {
  const text = `${action} ${status ?? ""}`.toLowerCase();
  if (text.includes("delete") || text.includes("disabled") || text.includes("suspended") || text.includes("failed") || text.includes("password") || text.includes("otp")) return "high";
  if (category === "security" || method === "email" || method === "qr" || text.includes("download") || text.includes("public")) return "medium";
  return "low";
}

function describeEvent(action: string, label: string, resourceName: string, actorName: string, method: ShareMethod) {
  if (action.includes("transfer")) return `${actorName} created a ${method === "system" ? "link" : method} transfer${resourceName ? ` for ${resourceName}` : ""}`;
  if (action.includes("upload")) return `${actorName} uploaded ${resourceName || "a file"} to Cloudflare R2 storage`;
  if (action.includes("download")) return `${actorName} downloaded ${resourceName || "a shared resource"}`;
  if (action.includes("delete")) return `${actorName} deleted ${resourceName || "a resource"}`;
  if (action.includes("registered")) return `${actorName} was added to the workspace`;
  if (action.includes("share") || action.includes("link")) return `${actorName} updated sharing access${resourceName ? ` for ${resourceName}` : ""}`;
  return label;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeAuditEvent(raw: any, index: number): AuditEvent {
  const data = (raw?.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, any>;
  const metadata = (raw?.metadata ?? data?.metadata ?? {}) as Record<string, unknown>;
  const actor = data.uploadedBy ?? data.senderId ?? data.user ?? data.actor ?? raw.user ?? raw.actor ?? data;
  const rawType = readString(raw?.type, data?.type);
  const action = readString(raw?.action, rawType, data?.action, "system_event").toLowerCase();
  const category = getCategory(action, rawType, data);
  const method = getMethod(action, data, metadata);
  const status = readString(data.status, raw.status, metadata.status);
  const resourceName = readString(
    data.originalName,
    data.fileName,
    data.title,
    data.name,
    raw.resourceName,
    raw.resource,
    metadata.fileName,
    metadata.title,
    metadata.name,
  );
  const actorName = readString(actor?.name, data.actorName, raw.actorName, data.name, "System");
  const label = action === rawType ? titleCase(rawType) : titleCase(action);

  return {
    id: readString(raw.id, raw._id, data._id, `${action}:${index}:${raw.createdAt ?? data.createdAt ?? Date.now()}`),
    action,
    label,
    description: readString(raw.description, data.description) || describeEvent(action, label, resourceName, actorName, method),
    category,
    method,
    risk: getRisk(action, category, status, method),
    actorName,
    actorEmail: readString(actor?.email, data.actorEmail, raw.actorEmail, data.email),
    actorRole: readString(actor?.role, data.actorRole, raw.actorRole, "user").toLowerCase(),
    actorIp: readString(raw.ip, data.ip, data.actorIp, metadata.ip, metadata.ipAddress),
    device: readString(raw.device, data.device, metadata.device),
    browser: readString(raw.browser, data.browser, metadata.browser),
    location: readString(raw.location, data.location, metadata.location),
    resourceName,
    resourceType: readString(data.targetType, data.resourceType, category),
    resourceId: readString(data._id, data.targetId, data.fileId, data.folderId, data.linkId),
    resourceSize: readNumber(data.size, data.totalSize, raw.resourceSize, metadata.fileSize, metadata.size),
    status,
    createdAt: readString(raw.createdAt, data.createdAt, data.updatedAt, new Date().toISOString()),
    metadata: {
      method,
      status,
      fileCount: data.fileCount ?? metadata.fileCount,
      folderCount: data.folderCount ?? metadata.folderCount,
      recipients: data.recipients ?? metadata.recipients,
      mimeType: data.mimeType ?? metadata.mimeType,
      resourceId: data._id ?? data.targetId,
      ...metadata,
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "superadmin"
      ? "bg-red-500/10 text-red-600 border-red-500/20"
      : role === "admin"
        ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
        : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-300";

  return <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase", cls)}>{role}</span>;
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const variant = risk === "high" ? "danger" : risk === "medium" ? "warning" : "success";
  return <Badge variant={variant}>{risk}</Badge>;
}

export default function AdminActivityPage() {
  const { user: me } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAuditLogs = pathname.includes("audit-logs");

  const role = me?.role?.toLowerCase();
  const isAdmin = role === "admin" || role === "superadmin";

  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<FilterCategory>("all");
  const [method, setMethod] = useState<FilterMethod>("all");
  const [risk, setRisk] = useState<FilterRisk>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (me && !isAdmin) router.replace("/dashboard");
  }, [me, isAdmin, router]);

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const res = isAuditLogs
        ? await adminApi.auditLogs({ limit: 100 })
        : await adminApi.activity({ limit: 100 });
      const inner = res.data?.data ?? res.data;
      const list = inner?.activities ?? inner?.activity ?? inner?.events ?? inner?.items ?? inner ?? [];
      setLogs((Array.isArray(list) ? list : []).map(normalizeAuditEvent));
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuditLogs]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() + 86_400_000 - 1 : null;

    return logs.filter((event) => {
      if (category !== "all" && event.category !== category) return false;
      if (method !== "all" && event.method !== method) return false;
      if (risk !== "all" && event.risk !== risk) return false;

      const eventTime = new Date(event.createdAt).getTime();
      if (from && eventTime < from) return false;
      if (to && eventTime > to) return false;

      if (!query) return true;
      return [
        event.action,
        event.label,
        event.description,
        event.actorName,
        event.actorEmail,
        event.actorIp,
        event.resourceName,
        event.resourceType,
        event.status,
        event.method,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [logs, category, method, risk, search, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const totalBytes = logs.reduce((sum, event) => sum + (event.resourceSize ?? 0), 0);
    const linkModes = logs.filter((event) => ["link", "qr", "email"].includes(event.method)).length;
    const highRisk = logs.filter((event) => event.risk === "high").length;
    const latest = logs[0]?.createdAt;

    return {
      total: logs.length,
      transfers: logs.filter((event) => event.category === "transfer").length,
      linkModes,
      highRisk,
      totalBytes,
      latest,
    };
  }, [logs]);

  const methodBreakdown = useMemo(() => {
    const entries: { method: ShareMethod; label: string }[] = [
      { method: "link", label: "Links" },
      { method: "qr", label: "QR" },
      { method: "email", label: "Email" },
      { method: "private", label: "Private" },
    ];
    return entries.map((entry) => ({
      ...entry,
      count: logs.filter((event) => event.method === entry.method).length,
    }));
  }, [logs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const hasFilters = category !== "all" || method !== "all" || risk !== "all" || Boolean(search || dateFrom || dateTo);

  function clearFilters() {
    setCategory("all");
    setMethod("all");
    setRisk("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-6 pb-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-600">
                {isAuditLogs ? <Shield size={19} /> : <Activity size={19} />}
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">
                  {isAuditLogs ? "Audit Logs" : "Activity Log"}
                </h1>
                <p className="mt-1 text-sm text-(--text-muted)">
                  Jai Export Enterprises workspace actions across files, folders, transfers, links, QR shares, email delivery, and users
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={role === "superadmin" ? "danger" : "warning"}>{role ?? "admin"}</Badge>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw size={14} className={refreshing || loading ? "animate-spin" : ""} />}
                onClick={() => load(true)}
                disabled={refreshing || loading}
              >
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Audit Events", value: stats.total.toLocaleString(), sub: "Last 100 from API", icon: <Activity size={16} />, color: "text-zinc-700 dark:text-zinc-200" },
              { label: "Transfers", value: stats.transfers.toLocaleString(), sub: "Link, QR, email", icon: <Send size={16} />, color: "text-orange-600" },
              { label: "Share Modes", value: stats.linkModes.toLocaleString(), sub: "Tracked delivery modes", icon: <QrCode size={16} />, color: "text-blue-600" },
              { label: "High Risk", value: stats.highRisk.toLocaleString(), sub: "Delete, disable, auth", icon: <AlertTriangle size={16} />, color: "text-red-600" },
              { label: "Data Moved", value: formatBytes(stats.totalBytes), sub: stats.latest ? formatRelative(stats.latest) : "No recent activity", icon: <Database size={16} />, color: "text-lime-700" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-(--border) bg-(--bg-card) p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-(--text-muted)">{item.label}</p>
                    <p className={cn("mt-1 text-2xl font-extrabold tabular-nums", item.color)}>
                      {loading ? "..." : item.value}
                    </p>
                    <p className="mt-1 text-[11px] text-(--text-muted)">{item.sub}</p>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-(--border) bg-(--bg-2) text-(--text-muted)">
                    {item.icon}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3 rounded-lg border border-(--border) bg-(--bg-card) p-4">
              <div className="flex flex-wrap gap-1 rounded-lg border border-(--border) bg-(--bg-2) p-1">
                {CATEGORY_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setCategory(tab.value)}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition",
                      category === tab.value
                        ? "bg-(--bg-card) text-orange-600 shadow-sm"
                        : "text-(--text-muted) hover:text-(--text-primary)",
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-2 xl:grid-cols-[1fr_auto_auto_auto]">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search actor, resource, IP, method, status..."
                    className="h-10 w-full rounded-lg border border-(--border) bg-(--bg-2) pl-9 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15"
                  />
                </div>

                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value as FilterMethod)}
                  className="h-10 rounded-lg border border-(--border) bg-(--bg-2) px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15"
                >
                  {METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>

                <select
                  value={risk}
                  onChange={(event) => setRisk(event.target.value as FilterRisk)}
                  className="h-10 rounded-lg border border-(--border) bg-(--bg-2) px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15"
                >
                  <option value="all">All risk</option>
                  <option value="high">High risk</option>
                  <option value="medium">Medium risk</option>
                  <option value="low">Low risk</option>
                </select>

                {hasFilters && (
                  <Button variant="ghost" size="sm" leftIcon={<XCircle size={13} />} onClick={clearFilters}>
                    Clear
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-(--text-muted)" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="h-9 rounded-lg border border-(--border) bg-(--bg-2) px-3 text-xs outline-none focus:border-orange-400"
                    aria-label="From date"
                  />
                  <span className="text-xs text-(--text-muted)">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="h-9 rounded-lg border border-(--border) bg-(--bg-2) px-3 text-xs outline-none focus:border-orange-400"
                    aria-label="To date"
                  />
                </div>

                <p className="text-xs text-(--text-muted)">
                  Showing <span className="font-bold text-(--text-primary)">{filtered.length}</span> of {logs.length} events
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-(--border) bg-(--bg-card) p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">Share Mode Trail</p>
                <Clock3 size={14} className="text-(--text-muted)" />
              </div>
              <div className="mt-4 space-y-3">
                {methodBreakdown.map((row) => {
                  const pct = logs.length ? Math.round((row.count / logs.length) * 100) : 0;
                  return (
                    <button
                      key={row.method}
                      type="button"
                      onClick={() => setMethod(row.method)}
                      className="w-full text-left"
                    >
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-semibold">
                          {METHOD_ICON[row.method]}
                          {row.label}
                        </span>
                        <span className="tabular-nums text-(--text-muted)">{row.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-(--bg-2)">
                        <div className="h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-80 items-center justify-center">
              <Spinner size={30} />
            </div>
          ) : pageItems.length === 0 ? (
            <EmptyState
              icon={<Activity size={36} />}
              title="No audit events found"
              description={hasFilters ? "Try changing the filters or date range." : "Workspace audit events will appear here as users act."}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-(--border) bg-(--bg-card)">
              <div className="overflow-x-auto">
                <table className="w-full min-w-230 text-sm">
                  <thead className="border-b border-(--border) bg-(--bg-2)">
                    <tr>
                      {["Event", "Actor", "Resource", "Method", "Source", "Risk", "Time"].map((head) => (
                        <th key={head} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-(--text-muted)">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--border)">
                    {pageItems.map((event) => {
                      const style = CATEGORY_STYLE[event.category];
                      const isExpanded = expanded === event.id;
                      return (
                        <Fragment key={event.id}>
                          <tr
                            className="cursor-pointer transition hover:bg-(--bg-2)"
                            onClick={() => setExpanded(isExpanded ? null : event.id)}
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-start gap-3">
                                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", style.tone)}>
                                  {style.icon}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-bold">{event.label}</p>
                                    <Badge variant={style.badge}>{style.label}</Badge>
                                  </div>
                                  <p className="mt-1 line-clamp-1 max-w-100 text-xs text-(--text-muted)">
                                    {event.description}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2.5">
                                <Avatar name={event.actorName} size={28} />
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-bold">{event.actorName}</p>
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <p className="max-w-36 truncate text-[11px] text-(--text-muted)">{event.actorEmail || "system"}</p>
                                    <RoleBadge role={event.actorRole} />
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-4">
                              {event.resourceName ? (
                                <div className="min-w-0">
                                  <p className="max-w-42 truncate text-xs font-semibold">{event.resourceName}</p>
                                  <p className="mt-1 text-[11px] text-(--text-muted)">
                                    {event.resourceType ?? event.category}
                                    {event.resourceSize !== undefined ? ` / ${formatBytes(event.resourceSize)}` : ""}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-(--text-muted)">Workspace event</span>
                              )}
                            </td>

                            <td className="px-5 py-4">
                              <Badge variant={event.method === "email" ? "info" : event.method === "qr" ? "warning" : "default"} className="capitalize">
                                <span className="mr-1">{METHOD_ICON[event.method]}</span>
                                {event.method}
                              </Badge>
                            </td>

                            <td className="px-5 py-4">
                              {event.actorIp || event.location || event.device || event.browser ? (
                                <div className="space-y-1 text-xs text-(--text-muted)">
                                  {event.location && (
                                    <p className="flex items-center gap-1">
                                      <MapPin size={11} />
                                      {event.location}
                                    </p>
                                  )}
                                  {event.actorIp && <p className="font-mono text-[11px]">{event.actorIp}</p>}
                                  {(event.device || event.browser) && (
                                    <p className="flex items-center gap-1">
                                      {event.device?.toLowerCase() === "mobile" ? <Smartphone size={11} /> : <Monitor size={11} />}
                                      {event.browser || event.device}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-(--text-muted)">Server</span>
                              )}
                            </td>

                            <td className="px-5 py-4">
                              <RiskBadge risk={event.risk} />
                            </td>

                            <td className="whitespace-nowrap px-5 py-4">
                              <p className="text-xs font-medium">{formatRelative(event.createdAt)}</p>
                              <p className="mt-1 text-[11px] text-(--text-muted)">{formatDateTime(event.createdAt)}</p>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-(--bg-2)">
                              <td colSpan={7} className="px-5 py-4">
                                <div className="grid gap-3 text-xs text-(--text-muted) lg:grid-cols-4">
                                  <div>
                                    <p className="font-bold text-(--text-primary)">Audit ID</p>
                                    <p className="mt-1 break-all font-mono">{event.id}</p>
                                  </div>
                                  <div>
                                    <p className="font-bold text-(--text-primary)">Resource ID</p>
                                    <p className="mt-1 break-all font-mono">{event.resourceId || "--"}</p>
                                  </div>
                                  <div>
                                    <p className="font-bold text-(--text-primary)">Status</p>
                                    <p className="mt-1 capitalize">{event.status || "recorded"}</p>
                                  </div>
                                  <div>
                                    <p className="font-bold text-(--text-primary)">Metadata</p>
                                    <p className="mt-1">
                                      {[
                                        event.metadata.fileCount !== undefined ? `${event.metadata.fileCount} files` : "",
                                        event.metadata.folderCount !== undefined ? `${event.metadata.folderCount} folders` : "",
                                        Array.isArray(event.metadata.recipients) ? `${event.metadata.recipients.length} recipients` : "",
                                      ].filter(Boolean).join(" / ") || "No extra metadata"}
                                    </p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filtered.length > PAGE_SIZE && (
                <div className="flex flex-col gap-3 border-t border-(--border) bg-(--bg-2) px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-(--text-muted)">
                    Showing {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Previous page"
                      disabled={safePage === 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-(--border) disabled:opacity-40"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="px-3 text-xs font-bold">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      aria-label="Next page"
                      disabled={safePage === totalPages}
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-(--border) disabled:opacity-40"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && logs.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-(--text-muted)">
              <AlertTriangle size={12} />
              Backend {isAuditLogs ? "audit logs" : "activity"} currently returns the most recent {logs.length} events. Filters are applied to that returned window.
            </p>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
