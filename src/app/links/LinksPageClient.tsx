"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Link as LinkIcon, Clock, CheckCircle, XCircle,
  Copy, Check, Search, MoreHorizontal, Trash2, RefreshCw, Shield,
  Globe, Users, Lock, ExternalLink, ArrowUpDown, AlertTriangle,
  X as XIcon, Crown, User as UserIcon, FolderOpen, QrCode, Mail,
  CalendarDays, Download, Eye, KeyRound, Plus, FileText, MessageCircle,
  Smartphone, Upload,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { parseRecipientEmails } from "@/lib/validation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { EmptyState } from "@/components/ui";
import { filesApi, foldersApi, linksApi } from "@/lib/api";
import { FileItem, Folder, SharedLink } from "@/types";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/utils";
import { handleApiError } from "@/lib/error-handler";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/contexts/AuthContext";
import UploadModal from "@/components/modals/UploadModal";
import { getLinksFromResponse } from "@/lib/transfers";

/* ─── Types ─── */
type StatusFilter = "all" | "active" | "expired" | "disabled";
type ShareMethod = "link" | "qr" | "email";
type SortKey = "createdAt" | "views" | "downloads" | "expiresAt";
type SortDir  = "asc" | "desc";
type ResourceType = "file" | "folder";
type DeliveryAction = "copy" | "email" | "whatsapp" | "sms";
type LinkAccessEvent = {
  id: string;
  action: "view" | "download";
  method: ShareMethod;
  ip: string;
  email?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  location?: string | null;
  fileId?: string | null;
  fileName?: string | null;
  createdAt: string;
};
type LinkAccessData = {
  accesses: LinkAccessEvent[];
  summary?: { views?: number; downloads?: number; uniqueVisitors?: number };
};
type MethodAwareSharedLink = SharedLink & {
  method?: string;
  shareMethod?: string;
  transferMethod?: string;
  deliveryMethod?: string;
  shareType?: string;
  transfer?: { method?: string };
  share?: { type?: string };
};

type CreateLinkForm = {
  resourceType: ResourceType;
  resourceId: string;
  method: ShareMethod;
  permission: "view" | "download";
  expiresIn: number;
  password: string;
  recipients: string;
};

const PAGE_SIZE = 10;

function getLinkListMeta(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const first = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const data = first.data && typeof first.data === "object" ? first.data as Record<string, unknown> : first;
  const total = Number(data.total ?? 0);
  const limit = Number(data.limit ?? PAGE_SIZE);
  const stats = data.stats && typeof data.stats === "object" ? data.stats as Record<string, unknown> : data;
  return {
    total: Number.isFinite(total) ? total : 0,
    pages: Math.max(1, Math.ceil(total / (Number.isFinite(limit) && limit > 0 ? limit : PAGE_SIZE))),
    counts: {
      all: Number(stats.totalLinks ?? total) || 0,
      active: Number(stats.activeLinks ?? 0) || 0,
      expired: Number(stats.expiredLinks ?? 0) || 0,
      disabled: Number(stats.disabledLinks ?? 0) || 0,
    },
  };
}

const METHOD_CONFIG: Record<ShareMethod, { title: string; description: string; label: string; icon: React.ReactNode }> = {
  link: {
    title: "Shared Links",
    description: "Platform-wide view of link-based shares",
    label: "Link",
    icon: <LinkIcon size={22} className="text-purple-500" />,
  },
  qr: {
    title: "QR Shares",
    description: "Platform-wide view of shares created for QR code access",
    label: "QR",
    icon: <QrCode size={22} className="text-emerald-500" />,
  },
  email: {
    title: "Email Shares",
    description: "Platform-wide view of shares delivered by email",
    label: "Email",
    icon: <Mail size={22} className="text-blue-500" />,
  },
};

function parseShareMethod(value: string | null): ShareMethod {
  if (value === "qr" || value === "email") return value;
  return "link";
}

function getShareMethod(link: MethodAwareSharedLink): ShareMethod | undefined {
  const raw =
    link.method ??
    link.shareMethod ??
    link.transferMethod ??
    link.deliveryMethod ??
    link.shareType ??
    link.transfer?.method ??
    link.share?.type;
  const normalized = raw?.toLowerCase();
  if (normalized === "qr" || normalized === "email" || normalized === "link") {
    return normalized;
  }
  return undefined;
}

function matchesShareMethod(link: SharedLink, method: ShareMethod): boolean {
  const linkMethod = getShareMethod(link as MethodAwareSharedLink);
  if (linkMethod) return linkMethod === method;
  return method === "link";
}

function methodHref(method: ShareMethod): string {
  return method === "link" ? "/links" : `/links?type=${method}`;
}

function methodIcon(method: ShareMethod, size = 12) {
  if (method === "qr") return <QrCode size={size} />;
  if (method === "email") return <Mail size={size} />;
  return <LinkIcon size={size} />;
}

function shareText(url: string) {
  return `Here is the secure Jai Export Enterprises share link: ${url}`;
}

function deliveryHref(action: Exclude<DeliveryAction, "copy">, url: string) {
  const text = shareText(url);
  if (action === "email") {
    return `mailto:?subject=${encodeURIComponent("Secure file share")}&body=${encodeURIComponent(text)}`;
  }
  if (action === "whatsapp") {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }
  return `sms:?&body=${encodeURIComponent(text)}`;
}

function resourceName(item: FileItem | Folder) {
  return "mimeType" in item
    ? item.name || item.originalName || "Untitled file"
    : item.name || "Untitled folder";
}

function MethodBadge({ method }: { method: ShareMethod }) {
  const cls =
    method === "qr"
      ? "bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:ring-emerald-800/40"
      : method === "email"
        ? "bg-blue-50 text-blue-600 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:ring-blue-800/40"
        : "bg-purple-50 text-purple-600 ring-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:ring-purple-800/40";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${cls}`}>
      {methodIcon(method, 10)}
      {METHOD_CONFIG[method].label}
    </span>
  );
}

function PermissionBadge({ permission }: { permission: SharedLink["permission"] }) {
  const canDownload = permission === "download";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${
      canDownload
        ? "bg-orange-50 text-orange-600 ring-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:ring-orange-800/40"
        : "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:ring-zinc-700"
    }`}>
      {canDownload ? <Download size={10} /> : <Eye size={10} />}
      {canDownload ? "Download" : "View only"}
    </span>
  );
}

/* ─── Role check ─── */
function normalizeRole(role?: string): "USER" | "ADMIN" | "SUPERADMIN" {
  const r = (role || "user").toUpperCase();
  if (r === "SUPERADMIN") return "SUPERADMIN";
  if (r === "ADMIN") return "ADMIN";
  return "USER";
}

/* ─── Status badge ─── */
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    active:   { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: <CheckCircle size={10} />, label: "Active" },
    expired:  { cls: "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400",               icon: <Clock size={10} />,       label: "Expired" },
    disabled: { cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",                icon: <XCircle size={10} />,     label: "Disabled" },
  };
  const s = cfg[status] ?? cfg.active;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
}

/* ─── Privacy icon ─── */
function PrivacyIcon({ privacy }: { privacy?: string }) {
  if (privacy === "public")   return <Globe  size={13} className="text-blue-500" />;
  if (privacy === "specific") return <Users  size={13} className="text-purple-500" />;
  return <Shield size={13} className="text-gray-400" />;
}

/* ─── Skeleton row ─── */
function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 11 }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-3.5 w-full animate-pulse rounded-md bg-gray-100 dark:bg-zinc-800" />
        </td>
      ))}
    </tr>
  );
}

/* ─── Sortable header cell ─── */
function SortTh({
  label, sortable, align = "left", activeSortKey, onSort,
}: {
  label: string;
  sortable?: SortKey;
  align?: "left" | "center";
  activeSortKey: SortKey;
  onSort: (key: SortKey) => void;
}) {
  const active = sortable && activeSortKey === sortable;
  return (
    <th
      className={`px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${align === "center" ? "text-center" : "text-left"} ${sortable ? "cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300" : ""}`}
      onClick={sortable ? () => onSort(sortable) : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortable && (
          <ArrowUpDown size={10} className={active ? "text-orange-500" : "text-gray-300 dark:text-zinc-600"} />
        )}
      </span>
    </th>
  );
}

/* ─── Confirm dialog ─── */
function ConfirmDialog({
  open, title, description, confirmLabel = "Delete",
  onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-200/80 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-500 ring-1 ring-red-200 dark:bg-red-950/40 dark:ring-red-800/40">
          <AlertTriangle size={19} />
        </div>
        <h2 className="mb-1 text-base font-bold text-gray-900 dark:text-white">{title}</h2>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        <div className="flex flex-col gap-2.5">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════
   PAGE
═══════════════════════════ */
export default function LinksPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const methodFilter = parseShareMethod(searchParams.get("type"));
  const methodConfig = METHOD_CONFIG[methodFilter];

  const role         = normalizeRole(user?.role);
  const isAdmin      = role === "ADMIN" || role === "SUPERADMIN";
  const isSuperAdmin = role === "SUPERADMIN";
  const scopeDescription = isSuperAdmin
    ? methodConfig.description
    : "Create and manage links for your uploaded files and folders";

  const [links, setLinks]       = useState<SharedLink[]>([]);
  const [loading, setLoading]   = useState(true);
  const [status, setStatus]     = useState<StatusFilter>("all");
  const [search, setSearch]     = useState("");
  const [copiedId, setCopied]   = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [acting, setActing]     = useState<string | null>(null);
  const [sortKey, setSortKey]   = useState<SortKey>("createdAt");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");
  const [confirmDelete, setConfirmDelete] = useState<SharedLink | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [creating, setCreating] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [createdLink, setCreatedLink] = useState<SharedLink | null>(null);
  const [accessLink, setAccessLink] = useState<SharedLink | null>(null);
  const [accessData, setAccessData] = useState<LinkAccessData | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [serverCounts, setServerCounts] = useState<Record<StatusFilter, number>>({ all: 0, active: 0, expired: 0, disabled: 0 });
  const [form, setForm] = useState<CreateLinkForm>({
    resourceType: "file",
    resourceId: "",
    method: methodFilter,
    permission: "download",
    expiresIn: 7,
    password: "",
    recipients: "",
  });

  /* ── Load links ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE, status, method: methodFilter };
      const res = isSuperAdmin ? await linksApi.adminList(params) : await linksApi.list(params);
      setLinks(getLinksFromResponse(res.data));
      const meta = getLinkListMeta(res.data);
      setTotal(meta.total);
      setTotalPages(meta.pages);
      setServerCounts(meta.counts);
      if (page > meta.pages) setPage(meta.pages);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, methodFilter, page, status]);

  useEffect(() => {
    setPage(1);
  }, [methodFilter, status]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    if (!showCreate) return;
    Promise.all([filesApi.list({ limit: 100 }), foldersApi.list({ limit: 100 })])
      .then(([fileRes, folderRes]) => {
        const fileData = fileRes.data?.data ?? fileRes.data;
        const folderData = folderRes.data?.data ?? folderRes.data;
        const nextFiles = fileData?.files ?? (Array.isArray(fileData) ? fileData : []);
        const nextFolders = folderData?.folders ?? (Array.isArray(folderData) ? folderData : []);
        setFiles(Array.isArray(nextFiles) ? nextFiles : []);
        setFolders(Array.isArray(nextFolders) ? nextFolders : []);
      })
      .catch(handleApiError);
  }, [showCreate]);

  /* Close dropdown on outside click */
  useEffect(() => {
    if (!menuOpen) return;
    const fn = () => setMenuOpen(null);
    document.addEventListener("click", fn);
    return () => document.removeEventListener("click", fn);
  }, [menuOpen]);

  /* ── Derived ── */
  const filtered = useMemo((): (SharedLink & { isExpiring: boolean })[] => {
    const now = new Date().getTime();
    let list = links.filter((l) => matchesShareMethod(l, methodFilter));
    if (status !== "all") list = list.filter((l) => l.status === status);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          (l.transferTitle ?? "").toLowerCase().includes(q) ||
          l.shortCode.toLowerCase().includes(q) ||
          (l.user?.name ?? "").toLowerCase().includes(q) ||
          (l.user?.email ?? "").toLowerCase().includes(q),
      );
    }
    return [...list]
      .sort((a, b) => {
        let va: number, vb: number;
        if (sortKey === "views")          { va = a.views;     vb = b.views; }
        else if (sortKey === "downloads") { va = a.downloads; vb = b.downloads; }
        else if (sortKey === "expiresAt") {
          va = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
          vb = b.expiresAt ? new Date(b.expiresAt).getTime() : 0;
        } else {
          va = new Date(a.createdAt).getTime();
          vb = new Date(b.createdAt).getTime();
        }
        return sortDir === "desc" ? vb - va : va - vb;
      })
      .map((l) => ({
        ...l,
        isExpiring:
          l.status === "active" && l.expiresAt != null
            ? new Date(l.expiresAt).getTime() - now < 2 * 86_400_000
            : false,
      }));
  }, [links, methodFilter, status, search, sortKey, sortDir]);

  const counts = serverCounts;

  const scopedLinks = useMemo(() => links.filter((l) => matchesShareMethod(l, methodFilter)), [links, methodFilter]);
  const totalViews     = useMemo(() => scopedLinks.reduce((a, l) => a + l.views, 0), [scopedLinks]);
  const totalDownloads = useMemo(() => scopedLinks.reduce((a, l) => a + l.downloads, 0), [scopedLinks]);
  const protectedCount = useMemo(() => scopedLinks.filter((l) => l.hasPassword).length, [scopedLinks]);
  const downloadEnabledCount = useMemo(() => scopedLinks.filter((l) => l.permission === "download").length, [scopedLinks]);

  const methodCounts = useMemo(() => ({
    link:  links.filter((l) => matchesShareMethod(l, "link")).length,
    qr:    links.filter((l) => matchesShareMethod(l, "qr")).length,
    email: links.filter((l) => matchesShareMethod(l, "email")).length,
  }), [links]);

  /* ── Sort toggle ── */
  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => d === "desc" ? "asc" : "desc"); return key; }
      setSortDir("desc");
      return key;
    });
  }, []);

  /* ── Actions ── */
  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url).catch(() => null);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  async function handleDisable(link: SharedLink) {
    setActing(link.id); setMenuOpen(null);
    const prev = links.slice();
    setLinks((ls) => ls.map((l) => l.id === link.id ? { ...l, status: "disabled" as const } : l));
    try {
      if (isSuperAdmin) await linksApi.adminDisable(link.id);
      else await linksApi.disable(link.id);
      showToast.success("Link disabled");
    } catch (err) { setLinks(prev); handleApiError(err); }
    finally { setActing(null); }
  }

  async function handleEnable(link: SharedLink) {
    setActing(link.id); setMenuOpen(null);
    const prev = links.slice();
    setLinks((ls) => ls.map((l) => l.id === link.id ? { ...l, status: "active" as const } : l));
    try {
      if (isSuperAdmin) await linksApi.adminEnable(link.id);
      else await linksApi.enable(link.id);
      showToast.success("Link enabled");
    } catch (err) { setLinks(prev); handleApiError(err); }
    finally { setActing(null); }
  }

  async function handleDelete(link: SharedLink) {
    setConfirmDelete(null);
    const prev = links.slice();
    setLinks((ls) => ls.filter((l) => l.id !== link.id));
    try {
      if (isSuperAdmin) await linksApi.adminDelete(link.id);
      else await linksApi.delete(link.id);
      showToast.success("Link deleted");
    } catch (err) { setLinks(prev); handleApiError(err); }
  }

  async function handleRenew(id: string) {
    setMenuOpen(null);
    try {
      if (isSuperAdmin) await linksApi.adminRenew(id, 7);
      else await linksApi.renew(id, 7);
      showToast.success("Link extended by 7 days");
      load();
    } catch (err) { handleApiError(err); }
  }

  async function handleCreateLink() {
    if (!form.resourceId) {
      showToast.error(`Choose a ${form.resourceType} first`);
      return;
    }
    setCreating(true);
    try {
      const { valid: recipients, invalid } = parseRecipientEmails(form.recipients);
      if (invalid.length > 0) {
        showToast.error(`Invalid email address: ${invalid[0]}`);
        return;
      }
      if (form.method === "email" && recipients.length === 0) {
        showToast.error("Add at least one email recipient");
        return;
      }
      const res = await linksApi.create({
        resourceType: form.resourceType,
        resourceId: form.resourceId,
        method: form.method,
        permission: form.permission,
        expiresIn: form.expiresIn,
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
        ...(recipients.length ? { recipients, privacy: "specific" } : {}),
      });
      const link = res.data?.data ?? res.data;
      setCreatedLink(link);
      setShowCreate(false);
      setForm((prev) => ({ ...prev, resourceId: "", password: "", recipients: "" }));
      showToast.success("Share link generated");
      load();
    } catch (err) {
      handleApiError(err);
    } finally {
      setCreating(false);
    }
  }

  async function openAccessDetails(link: SharedLink) {
    setMenuOpen(null);
    setAccessLink(link);
    setAccessLoading(true);
    try {
      const res = await linksApi.accesses(link.id, { limit: 100 });
      setAccessData(res.data?.data ?? res.data);
    } catch (err) {
      handleApiError(err);
    } finally {
      setAccessLoading(false);
    }
  }

  const sortProps = { activeSortKey: sortKey, onSort: toggleSort };

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-6 pb-10">

          {/* ── Header ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900 dark:text-white">
                  {methodConfig.icon} {methodConfig.title}
                </h1>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                  isSuperAdmin
                    ? "bg-red-50 text-red-600 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-800/40"
                    : "bg-orange-50 text-orange-600 ring-1 ring-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:ring-orange-800/40"
                }`}>
                  {isSuperAdmin ? <Shield size={9} /> : isAdmin ? <Crown size={9} /> : <UserIcon size={9} />}
                  {isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : "My Links"}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {scopeDescription}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition-colors hover:text-orange-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300">
                <Upload size={12} /> Upload and link
              </button>
              <button type="button" onClick={() => {
                setForm((prev) => ({ ...prev, method: methodFilter }));
                setShowCreate(true);
              }}
                className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600">
                <Plus size={12} /> Generate link
              </button>
              <button type="button" onClick={load} disabled={loading} aria-label="Refresh links"
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition-colors hover:text-orange-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300">
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              {
                label: `${methodConfig.label} Shares`,
                value: counts.all,
                color:
                  methodFilter === "qr"
                    ? "text-emerald-500"
                    : methodFilter === "email"
                      ? "text-blue-500"
                      : "text-purple-500",
              },
              { label: "Active",       value: counts.active,  color: "text-emerald-500" },
              { label: "Total Views",  value: totalViews,     color: "text-blue-500" },
              { label: "Downloads",    value: totalDownloads, color: "text-orange-500" },
            ] as const).map((c) => (
              <div key={c.label} className="rounded-2xl border border-gray-200/70 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                {loading
                  ? <div className="mb-1 h-5 w-10 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
                  : <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>}
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            ))}
          </div>

          {/* ── Share method details ── */}
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-gray-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              {(["link", "qr", "email"] as ShareMethod[]).map((method) => {
                const active = method === methodFilter;
                return (
                  <Link
                    key={method}
                    href={methodHref(method)}
                    className={`flex items-center gap-2 border-r border-gray-100 px-4 py-3 transition-colors last:border-r-0 dark:border-zinc-800 ${
                      active
                        ? "bg-orange-50/70 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-zinc-800/60 dark:hover:text-gray-200"
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                      method === "qr"
                        ? "bg-emerald-50 text-emerald-500 dark:bg-emerald-900/20"
                        : method === "email"
                          ? "bg-blue-50 text-blue-500 dark:bg-blue-900/20"
                          : "bg-purple-50 text-purple-500 dark:bg-purple-900/20"
                    }`}>
                      {methodIcon(method, 14)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{METHOD_CONFIG[method].title}</span>
                      <span className="block text-[11px] text-gray-400">{methodCounts[method]} total</span>
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              {[
                { label: "Protected", value: protectedCount, icon: <KeyRound size={13} />, color: "text-yellow-600" },
                { label: "Download Enabled", value: downloadEnabledCount, icon: <Download size={13} />, color: "text-orange-500" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-gray-200/70 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${item.color}`}>
                    {item.icon}
                    {item.label}
                  </div>
                  {loading
                    ? <div className="h-5 w-9 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
                    : <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{item.value}</p>}
                </div>
              ))}
            </div>
          </div>

          {createdLink && (
            <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-800/40 dark:bg-emerald-950/20">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle size={15} />
                    Link generated
                  </div>
                  <p className="truncate font-mono text-xs text-emerald-800 dark:text-emerald-300">
                    {createdLink.url}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => handleCopy(createdLink.id, createdLink.url)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-emerald-200 transition hover:text-orange-600 dark:bg-zinc-900 dark:text-gray-200 dark:ring-emerald-800/40">
                    <Copy size={12} /> Copy
                  </button>
                  <a href={deliveryHref("email", createdLink.url)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-emerald-200 transition hover:text-blue-600 dark:bg-zinc-900 dark:text-gray-200 dark:ring-emerald-800/40">
                    <Mail size={12} /> Email
                  </a>
                  <a href={deliveryHref("whatsapp", createdLink.url)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-emerald-200 transition hover:text-emerald-600 dark:bg-zinc-900 dark:text-gray-200 dark:ring-emerald-800/40">
                    <MessageCircle size={12} /> WhatsApp
                  </a>
                  <a href={deliveryHref("sms", createdLink.url)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-emerald-200 transition hover:text-purple-600 dark:bg-zinc-900 dark:text-gray-200 dark:ring-emerald-800/40">
                    <Smartphone size={12} /> Message
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ── Filters ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 rounded-2xl border border-gray-200/70 bg-gray-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
              {(["all", "active", "expired", "disabled"] as StatusFilter[]).map((f) => (
                <button key={f} type="button" onClick={() => setStatus(f)}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-medium capitalize transition-all
                    ${status === f
                      ? "bg-white text-orange-600 shadow-sm dark:bg-zinc-800 dark:text-orange-400"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${status === f ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30" : "bg-gray-200 text-gray-500 dark:bg-zinc-700 dark:text-gray-400"}`}>
                    {counts[f]}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search links, users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white sm:w-64"
              />
              {search && (
                <button type="button" aria-label="Clear search" onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <XIcon size={13} />
                </button>
              )}
            </div>
          </div>

          {/* ── Table ── */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {!loading && filtered.length === 0 ? (
              <EmptyState
                icon={<LinkIcon size={36} />}
                title="No links found"
                description={search ? "Try a different search term" : `No ${methodConfig.label.toLowerCase()} shares found in this view`}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <tr>
                      <SortTh label="Owner"     {...sortProps} />
                      <SortTh label="Share Details"      {...sortProps} />
                      <SortTh label="Short Code" {...sortProps} />
                      <SortTh label="Status"    align="center" {...sortProps} />
                      <SortTh label="Privacy"   align="center" {...sortProps} />
                      <SortTh label="Views"     sortable="views"     align="center" {...sortProps} />
                      <SortTh label="Downloads" sortable="downloads" align="center" {...sortProps} />
                      <SortTh label="Last Seen" {...sortProps} />
                      <SortTh label="Expires"   sortable="expiresAt" {...sortProps} />
                      <SortTh label="Created"   sortable="createdAt" {...sortProps} />
                      <th className="px-4 py-3.5 text-xs font-semibold text-gray-500" aria-label="Actions">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                    {loading
                      ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                      : filtered.map((l) => {
                          const { isExpiring } = l;
                          const shareMethod = getShareMethod(l as MethodAwareSharedLink) ?? "link";
                          return (
                            <tr key={l.id}
                              className={`group transition-colors hover:bg-orange-50/30 dark:hover:bg-orange-500/5 ${acting === l.id ? "pointer-events-none opacity-50" : ""}`}>

                              {/* Owner */}
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-zinc-800">
                                    <UserIcon size={13} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-200">
                                      {l.user?.name ?? "—"}
                                    </p>
                                    <p className="truncate text-[11px] text-gray-400">{l.user?.email ?? ""}</p>
                                  </div>
                                </div>
                              </td>

                              {/* Link / Transfer */}
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                    l.type === "share"
                                      ? "bg-amber-100 text-amber-500 dark:bg-amber-900/20"
                                      : "bg-purple-100 text-purple-500 dark:bg-purple-900/20"
                                  }`}>
                                    {l.type === "share" ? <FolderOpen size={15} /> : <LinkIcon size={15} />}
                                  </div>
                                  <div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <MethodBadge method={shareMethod} />
                                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                        l.type === "share"
                                          ? "bg-amber-50 text-amber-600 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:ring-amber-800/40"
                                          : "bg-purple-50 text-purple-600 ring-1 ring-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:ring-purple-800/40"
                                      }`}>
                                        {l.type === "share" ? "Share" : "Transfer"}
                                      </span>
                                      {l.type === "transfer" && l.transferId ? (
                                        <Link href={`/transfers/${l.transferId}`}
                                          className="font-semibold text-gray-900 hover:text-orange-500 dark:text-white dark:hover:text-orange-400">
                                          {l.transferTitle ?? "Untitled"}
                                        </Link>
                                      ) : (
                                        <a href={`/l/${l.shortCode}`} target="_blank" rel="noopener noreferrer"
                                          className="font-semibold text-gray-900 hover:text-orange-500 dark:text-white dark:hover:text-orange-400">
                                          Share Link
                                        </a>
                                      )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                      <PermissionBadge permission={l.permission} />
                                      {(l.fileCount !== undefined || l.totalSize !== undefined) && (
                                        <span className="inline-flex items-center rounded-full bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-zinc-800 dark:text-gray-400 dark:ring-zinc-700">
                                          {l.fileCount !== undefined && `${l.fileCount} file${l.fileCount !== 1 ? "s" : ""}`}
                                          {l.fileCount !== undefined && l.totalSize !== undefined && " · "}
                                          {l.totalSize !== undefined && formatBytes(l.totalSize)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Short link */}
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{l.shortCode}</span>
                                  <button type="button" title="Copy link" aria-label="Copy link" onClick={() => handleCopy(l.id, l.url)}
                                    className="text-gray-400 transition-colors hover:text-orange-500">
                                    {copiedId === l.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                                  </button>
                                  <a href={l.url} target="_blank" rel="noopener noreferrer"
                                    title="Open link in new tab" aria-label="Open link in new tab"
                                    className="text-gray-400 transition-colors hover:text-blue-500">
                                    <ExternalLink size={13} />
                                  </a>
                                </div>
                              </td>

                              {/* Status */}
                              <td className="px-4 py-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <StatusBadge status={l.status} />
                                  {isExpiring && (
                                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                      <AlertTriangle size={9} /> Expiring soon
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Privacy */}
                              <td className="px-4 py-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <PrivacyIcon privacy={l.privacy} />
                                    <span className="text-[11px] font-semibold capitalize text-gray-600 dark:text-gray-300">
                                      {l.privacy ?? "private"}
                                    </span>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                                    l.hasPassword ? "text-yellow-600 dark:text-yellow-400" : "text-gray-400"
                                  }`}>
                                    {l.hasPassword ? <Lock size={10} /> : <Shield size={10} />}
                                    {l.hasPassword ? "Password" : "No password"}
                                  </span>
                                </div>
                              </td>

                              {/* Views */}
                              <td className="px-4 py-4 text-center font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                                {l.views}
                              </td>

                              {/* Downloads */}
                              <td className="px-4 py-4 text-center font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                                {l.downloads}
                              </td>

                              {/* Last seen */}
                              <td className="px-4 py-4 text-xs text-gray-500">
                                {l.lastViewedAt ? formatRelative(l.lastViewedAt) : "—"}
                              </td>

                              {/* Expires */}
                              <td className="px-4 py-4">
                                <span className={`text-xs font-medium ${isExpiring ? "text-amber-600 dark:text-amber-400" : "text-gray-500"}`}>
                                  {l.expiresAt ? formatRelative(l.expiresAt) : "Never"}
                                </span>
                              </td>

                              {/* Created */}
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                  <CalendarDays size={12} className="text-gray-400" />
                                  <span>{formatDateTime(l.createdAt)}</span>
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-4">
                                <div className="relative">
                                  <button type="button" aria-label="More options for this link"
                                    onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === l.id ? null : l.id); }}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800">
                                    <MoreHorizontal size={14} />
                                  </button>

                                  {menuOpen === l.id && (
                                    <div className="absolute right-0 top-9 z-20 min-w-44 rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
                                      onClick={(e) => e.stopPropagation()}>
                                      <button type="button" onClick={() => handleCopy(l.id, l.url)}
                                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800">
                                        <Copy size={13} /> Copy Link
                                      </button>
                                      <button type="button" onClick={() => openAccessDetails(l)}
                                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800">
                                        <Eye size={13} /> View Details
                                      </button>
                                      <a href={l.url} target="_blank" rel="noopener noreferrer"
                                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800"
                                        onClick={() => setMenuOpen(null)}>
                                        <ExternalLink size={13} /> Open Link
                                      </a>
                                      <a href={deliveryHref("email", l.url)}
                                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800"
                                        onClick={() => setMenuOpen(null)}>
                                        <Mail size={13} /> Send Email
                                      </a>
                                      <a href={deliveryHref("whatsapp", l.url)} target="_blank" rel="noopener noreferrer"
                                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800"
                                        onClick={() => setMenuOpen(null)}>
                                        <MessageCircle size={13} /> WhatsApp
                                      </a>
                                      <a href={deliveryHref("sms", l.url)}
                                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800"
                                        onClick={() => setMenuOpen(null)}>
                                        <Smartphone size={13} /> Message
                                      </a>
                                      {l.type === "share" && (
                                        <a href={`/l/${l.shortCode}`} target="_blank" rel="noopener noreferrer"
                                          className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800"
                                          onClick={() => setMenuOpen(null)}>
                                          <FolderOpen size={13} /> Browse Files
                                        </a>
                                      )}

                                      {l.status === "active" && (
                                        <button type="button" onClick={() => handleDisable(l)}
                                          className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800">
                                          <XCircle size={13} /> Disable
                                        </button>
                                      )}
                                      {l.status === "disabled" && (
                                        <button type="button" onClick={() => handleEnable(l)}
                                          className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800">
                                          <CheckCircle size={13} /> Enable
                                        </button>
                                      )}

                                      <button type="button" onClick={() => handleRenew(l.id)}
                                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800">
                                        <RefreshCw size={13} /> Extend 7 Days
                                      </button>

                                      <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />

                                      <button type="button" onClick={() => { setMenuOpen(null); setConfirmDelete(l); }}
                                        className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                                        <Trash2 size={13} /> Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer count */}
            {!loading && filtered.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500">
                  Showing{" "}
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{filtered.length}</span>
                  {" "}of{" "}
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{total}</span>
                  {" "}{methodConfig.label.toLowerCase()} shares
                  {search && (
                    <> matching <span className="font-semibold text-orange-500">&ldquo;{search}&rdquo;</span></>
                  )}
                </p>
                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" aria-label="Previous page" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || loading} className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-600 transition hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-gray-300">
                      <ChevronLeft size={13} /> Prev
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
                      const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                      const pageNumber = start + index;
                      return (
                        <button type="button" key={pageNumber} aria-label={`Go to page ${pageNumber}`} aria-current={pageNumber === page ? "page" : undefined} onClick={() => setPage(pageNumber)} className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition ${pageNumber === page ? "bg-orange-500 text-white shadow-sm" : "border border-gray-200 text-gray-600 hover:border-orange-200 hover:text-orange-600 dark:border-zinc-700 dark:text-gray-300"}`}>
                          {pageNumber}
                        </button>
                      );
                    })}
                    <button type="button" aria-label="Next page" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages || loading} className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-600 transition hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-gray-300">
                      Next <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Delete confirm dialog ── */}
        <ConfirmDialog
          open={!!confirmDelete}
          title="Delete link?"
          description={`This will permanently delete the link for "${confirmDelete?.transferTitle ?? "this transfer"}". Recipients will no longer be able to access it.`}
          confirmLabel="Delete Link"
          onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />

        {accessLink && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setAccessLink(null)} aria-hidden="true" />
            <div className="relative z-10 flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-5 dark:border-zinc-800">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Viewer and download details</h2>
                  <p className="truncate font-mono text-xs text-gray-500">{accessLink.url}</p>
                </div>
                <button type="button" onClick={() => setAccessLink(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800">
                  <XIcon size={15} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 border-b border-gray-100 p-5 dark:border-zinc-800">
                {[
                  { label: "Views", value: accessData?.summary?.views ?? accessLink.views, icon: <Eye size={14} />, color: "text-blue-500" },
                  { label: "Downloads", value: accessData?.summary?.downloads ?? accessLink.downloads, icon: <Download size={14} />, color: "text-orange-500" },
                  { label: "Unique visitors", value: accessData?.summary?.uniqueVisitors ?? 0, icon: <Users size={14} />, color: "text-emerald-500" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-gray-200/70 bg-gray-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <div className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${item.color}`}>
                      {item.icon}{item.label}
                    </div>
                    <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-auto p-5">
                {accessLoading ? (
                  <div className="flex min-h-48 items-center justify-center">
                    <RefreshCw size={22} className="animate-spin text-orange-500" />
                  </div>
                ) : !accessData?.accesses?.length ? (
                  <EmptyState
                    icon={<Eye size={34} />}
                    title="No visitor details yet"
                    description="Views and downloads will appear here after someone opens this link."
                  />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-zinc-950/60">
                        <tr>
                          <th className="px-4 py-3 text-left">Action</th>
                          <th className="px-4 py-3 text-left">Person / IP</th>
                          <th className="px-4 py-3 text-left">Device</th>
                          <th className="px-4 py-3 text-left">Browser / OS</th>
                          <th className="px-4 py-3 text-left">Location</th>
                          <th className="px-4 py-3 text-left">File</th>
                          <th className="px-4 py-3 text-left">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                        {accessData.accesses.map((event) => (
                          <tr key={event.id} className="hover:bg-orange-50/30 dark:hover:bg-orange-500/5">
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                                event.action === "download"
                                  ? "bg-orange-50 text-orange-600 ring-1 ring-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:ring-orange-800/40"
                                  : "bg-blue-50 text-blue-600 ring-1 ring-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:ring-blue-800/40"
                              }`}>
                                {event.action === "download" ? <Download size={11} /> : <Eye size={11} />}
                                {event.action}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                {event.email ?? event.userId ?? "Anonymous visitor"}
                              </p>
                              <p className="font-mono text-[11px] text-gray-400">{event.ip}</p>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{event.device ?? "Unknown"}</td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-gray-700 dark:text-gray-200">{event.browser ?? "Unknown"}</p>
                              <p className="text-[11px] text-gray-400">{event.os ?? "Unknown"}</p>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{event.location ?? "Unknown"}</td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{event.fileName ?? "-"}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(event.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setShowCreate(false)} aria-hidden="true" />
            <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
              <div className="h-1 bg-linear-to-r from-orange-500 to-amber-500" />
              <div className="p-5">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Generate share link</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Choose one uploaded file or folder and create a secure link.</p>
                  </div>
                  <button type="button" onClick={() => setShowCreate(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800">
                    <XIcon size={15} />
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {(["file", "folder"] as ResourceType[]).map((type) => (
                        <button key={type} type="button"
                          onClick={() => setForm((prev) => ({ ...prev, resourceType: type, resourceId: "" }))}
                          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${
                            form.resourceType === type
                              ? "border-orange-300 bg-orange-50 text-orange-600 dark:border-orange-800/60 dark:bg-orange-950/20"
                              : "border-gray-200 text-gray-600 hover:border-orange-200 dark:border-zinc-700 dark:text-gray-300"
                          }`}>
                          {type === "file" ? <FileText size={14} /> : <FolderOpen size={14} />}
                          {type}
                        </button>
                      ))}
                    </div>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Select {form.resourceType}
                      </span>
                      <select value={form.resourceId}
                        onChange={(e) => setForm((prev) => ({ ...prev, resourceId: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
                        <option value="">Choose {form.resourceType}</option>
                        {(form.resourceType === "file" ? files : folders).map((item) => (
                          <option key={item.id} value={item.id}>
                            {resourceName(item)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button type="button" onClick={() => setShowUpload(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-orange-200 hover:text-orange-600 dark:border-zinc-700 dark:text-gray-300">
                      <Upload size={12} /> Upload new files or folders
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">Send type</span>
                      <div className="grid grid-cols-3 gap-2">
                        {(["link", "qr", "email"] as ShareMethod[]).map((method) => (
                          <button key={method} type="button"
                            onClick={() => setForm((prev) => ({ ...prev, method }))}
                            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold uppercase transition ${
                              form.method === method
                                ? "border-orange-300 bg-orange-50 text-orange-600 dark:border-orange-800/60 dark:bg-orange-950/20"
                                : "border-gray-200 text-gray-500 hover:border-orange-200 dark:border-zinc-700"
                            }`}>
                            {methodIcon(method, 13)}
                            {method}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">Permission</span>
                        <select value={form.permission}
                          onChange={(e) => setForm((prev) => ({ ...prev, permission: e.target.value as "view" | "download" }))}
                          className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-orange-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
                          <option value="download">View and download</option>
                          <option value="view">View only</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">Expiry</span>
                        <select value={form.expiresIn}
                          onChange={(e) => setForm((prev) => ({ ...prev, expiresIn: Number(e.target.value) }))}
                          className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-orange-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
                          <option value={1}>1 day</option>
                          <option value={7}>7 days</option>
                          <option value={30}>30 days</option>
                          <option value={90}>90 days</option>
                        </select>
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">Password</span>
                      <input value={form.password}
                        onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="Optional"
                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white" />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">Recipients</span>
                      <input value={form.recipients}
                        onChange={(e) => setForm((prev) => ({ ...prev, recipients: e.target.value }))}
                        placeholder="Email addresses, optional"
                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white" />
                    </label>
                  </div>
                </div>

                <div className="mt-5 flex flex-col justify-end gap-2">
                  <button type="button" onClick={() => setShowCreate(false)}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800">
                    Cancel
                  </button>
                  <button type="button" onClick={handleCreateLink} disabled={creating}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
                    {creating ? <RefreshCw size={14} className="animate-spin" /> : <LinkIcon size={14} />}
                    Generate link
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <UploadModal
          open={showUpload}
          transferMode
          onClose={() => setShowUpload(false)}
          onUploadComplete={() => {
            load();
            if (showCreate) {
              Promise.all([filesApi.list({ limit: 100 }), foldersApi.list({ limit: 100 })])
                .then(([fileRes, folderRes]) => {
                  const fileData = fileRes.data?.data ?? fileRes.data;
                  const folderData = folderRes.data?.data ?? folderRes.data;
                  setFiles(fileData?.files ?? (Array.isArray(fileData) ? fileData : []));
                  setFolders(folderData?.folders ?? (Array.isArray(folderData) ? folderData : []));
                })
                .catch(() => {});
            }
          }}
        />
      </DashboardLayout>
    </AuthGuard>
  );
}
