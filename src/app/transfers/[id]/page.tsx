"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Send, Eye, Download, Clock, CheckCircle, XCircle, Copy, Check,
  Lock, Unlock, RefreshCw, Trash2, ArrowLeft, Users, Globe, Shield,
  FileText, Image as ImageIcon, Video, Archive, Table2, File, ExternalLink,
  Activity, MapPin, Monitor, Smartphone, ChevronDown, ChevronUp,
  ChevronRight, AlertTriangle, Mail, QrCode, Link as LinkIcon,
  ToggleLeft, ToggleRight, CloudUpload, Zap, TrendingUp, Folder, FolderOpen,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { formatBytes, formatRelative } from "@/lib/utils";
import {
  getTransferFileCount,
  getTransferLink,
  getTransferSenderEmail,
  getTransferSenderLabel,
  getTransferTotalSize,
} from "@/lib/transfers";
import { transfersApi } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { Transfer, ViewerDetail, TransferActivity } from "@/types";

type FullTransfer = Transfer & {
  viewerDetails?: ViewerDetail[];
  activity?: TransferActivity[];
  method?: string;
};

/* ──────────────────────────────────────────
   File icon
────────────────────────────────────────── */
function FileIcon({ ext }: { ext: string }) {
  const e = ext.toLowerCase();
  if (["pdf"].includes(e))                                 return <FileText size={16} className="text-red-500" />;
  if (["jpg","jpeg","png","gif","svg","webp"].includes(e)) return <ImageIcon size={16} className="text-blue-500" />;
  if (["mp4","mov","avi","mkv"].includes(e))               return <Video    size={16} className="text-purple-500" />;
  if (["zip","tar","gz","rar","7z"].includes(e))           return <Archive  size={16} className="text-amber-500" />;
  if (["xls","xlsx","csv"].includes(e))                    return <Table2   size={16} className="text-green-500" />;
  return <File size={16} className="text-gray-400" />;
}

/* ──────────────────────────────────────────
   Method badge
────────────────────────────────────────── */
function MethodBadge({ method }: { method?: string }) {
  const cfg: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    email:    { icon: <Mail size={10} />,          label: "Email",    cls: "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30" },
    link:     { icon: <LinkIcon size={10} />,       label: "Link",     cls: "bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-900/30" },
    qr:       { icon: <QrCode size={10} />,         label: "QR Code",  cls: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30" },
  };
  const m = method ? cfg[method.toLowerCase()] : undefined;
  if (!m) return <span className="inline-flex items-center gap-1 rounded-full border border-orange-100 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600 dark:border-orange-900/30 dark:bg-orange-900/20 dark:text-orange-400"><Send size={10} /> Direct</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${m.cls}`}>
      {m.icon} {m.label}
    </span>
  );
}

/* ──────────────────────────────────────────
   Folder tree helpers (mirrors public /t/[id] page)
────────────────────────────────────────── */
interface TFolderNode {
  name: string;
  path: string;
  files: import("@/types").TransferFile[];
  children: Record<string, TFolderNode>;
}

/* Fixed Tailwind padding classes per nesting depth (avoids inline styles) */
const DEPTH_PL = ["pl-5", "pl-10", "pl-16", "pl-20", "pl-24"] as const;
const DEPTH_ML = ["ml-8", "ml-14", "ml-20", "ml-24", "ml-28"] as const;
function depthPl(d: number) { return DEPTH_PL[Math.min(d, DEPTH_PL.length - 1)]; }
function depthMl(d: number) { return DEPTH_ML[Math.min(d, DEPTH_ML.length - 1)]; }

function buildTransferFolderTree(files: import("@/types").TransferFile[]): {
  rootFiles: import("@/types").TransferFile[];
  folders: TFolderNode[];
} {
  const rootFiles: import("@/types").TransferFile[] = [];
  const folderMap: Record<string, TFolderNode> = {};

  for (const file of files) {
    const rel = file.relativePath ?? file.name;
    const parts = rel.split("/");

    if (parts.length === 1) { rootFiles.push(file); continue; }

    const rootName = parts[0];
    if (!folderMap[rootName]) {
      folderMap[rootName] = { name: rootName, path: rootName, files: [], children: {} };
    }
    let node = folderMap[rootName];
    for (let i = 1; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.children[seg]) {
        node.children[seg] = { name: seg, path: `${node.path}/${seg}`, files: [], children: {} };
      }
      node = node.children[seg];
    }
    node.files.push(file);
  }

  return {
    rootFiles,
    folders: Object.values(folderMap).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function countFolderFiles(node: TFolderNode): number {
  return node.files.length +
    Object.values(node.children).reduce((s, c) => s + countFolderFiles(c), 0);
}

function TransferFolderNode({ node, depth = 0 }: { node: TFolderNode; depth?: number }) {
  const [open, setOpen] = useState(true);
  const subFolders = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
  const totalFiles = countFolderFiles(node);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`flex w-full items-center gap-2 py-2.5 pr-5 text-left transition-colors hover:bg-gray-50/80 dark:hover:bg-zinc-800/50 ${depthPl(depth)}`}
      >
        {open
          ? <ChevronDown  size={12} className="shrink-0 text-gray-400" />
          : <ChevronRight size={12} className="shrink-0 text-gray-400" />}
        {open
          ? <FolderOpen size={15} className="shrink-0 text-amber-500" />
          : <Folder     size={15} className="shrink-0 text-amber-500" />}
        <span className="flex-1 truncate text-sm font-semibold text-(--text)">{node.name}</span>
        <span className="shrink-0 text-[11px] text-(--text-muted)">
          {totalFiles} file{totalFiles !== 1 ? "s" : ""}
          {subFolders.length > 0 && ` · ${subFolders.length} folder${subFolders.length !== 1 ? "s" : ""}`}
        </span>
      </button>

      {open && (
        <div className={`border-l border-gray-100 dark:border-zinc-800 ${depthMl(depth)}`}>
          {subFolders.map((sub) => (
            <TransferFolderNode key={sub.path} node={sub} depth={depth + 1} />
          ))}
          {node.files.map((f) => (
            <TransferFileRow key={f.id} file={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function TransferFileRow({ file }: { file: import("@/types").TransferFile }) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-50/80 px-4 py-2.5 transition-colors last:border-0 hover:bg-gray-50/50 dark:border-zinc-800/50 dark:hover:bg-zinc-800/30">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 dark:bg-zinc-800">
        <FileIcon ext={file.extension} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-(--text)">{file.name}</p>
        <p className="text-xs text-(--text-muted)">{formatBytes(file.size)} · {file.extension.toUpperCase()}</p>
      </div>
      {file.url && (
        <a href={file.url} target="_blank" rel="noopener noreferrer"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20"
          title={`Download ${file.name}`}>
          <Download size={13} />
        </a>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────
   Status badge
────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    active:   { cls: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30", icon: <CheckCircle size={10} /> },
    expired:  { cls: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-zinc-800 dark:text-gray-400 dark:border-zinc-700", icon: <Clock size={10} /> },
    disabled: { cls: "bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30", icon: <XCircle size={10} /> },
  };
  const s = map[status] ?? map.active;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${s.cls}`}>
      {s.icon} {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/* ──────────────────────────────────────────
   Privacy icon
────────────────────────────────────────── */
function PrivacyBadge({ privacy }: { privacy: string }) {
  if (privacy === "public")   return <span className="flex items-center gap-1 text-blue-500"><Globe size={12} /> Public</span>;
  if (privacy === "specific") return <span className="flex items-center gap-1 text-purple-500"><Users size={12} /> Specific</span>;
  return <span className="flex items-center gap-1 text-gray-500"><Shield size={12} /> Private</span>;
}

/* ──────────────────────────────────────────
   Activity icon
────────────────────────────────────────── */
function ActivityIcon({ action }: { action: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string }> = {
    created:          { icon: <Send size={12} />,         cls: "bg-orange-50 text-orange-500 dark:bg-orange-900/20" },
    view:             { icon: <Eye size={12} />,          cls: "bg-purple-50 text-purple-500 dark:bg-purple-900/20" },
    viewed:           { icon: <Eye size={12} />,          cls: "bg-purple-50 text-purple-500 dark:bg-purple-900/20" },
    download:         { icon: <Download size={12} />,     cls: "bg-blue-50 text-blue-500 dark:bg-blue-900/20" },
    downloaded:       { icon: <Download size={12} />,     cls: "bg-blue-50 text-blue-500 dark:bg-blue-900/20" },
    link_disabled:    { icon: <XCircle size={12} />,      cls: "bg-red-50 text-red-500 dark:bg-red-900/20" },
    link_enabled:     { icon: <CheckCircle size={12} />,  cls: "bg-emerald-50 text-emerald-500 dark:bg-emerald-900/20" },
    expiry_extended:  { icon: <RefreshCw size={12} />,    cls: "bg-amber-50 text-amber-500 dark:bg-amber-900/20" },
    password_set:     { icon: <Lock size={12} />,         cls: "bg-gray-100 text-gray-500 dark:bg-zinc-800" },
    password_removed: { icon: <Unlock size={12} />,       cls: "bg-gray-100 text-gray-400 dark:bg-zinc-800" },
    recipient_added:  { icon: <Users size={12} />,        cls: "bg-blue-50 text-blue-400 dark:bg-blue-900/20" },
    forwarded:        { icon: <ExternalLink size={12} />, cls: "bg-sky-50 text-sky-500 dark:bg-sky-900/20" },
  };
  const m = map[action] ?? { icon: <Activity size={12} />, cls: "bg-gray-100 text-gray-400 dark:bg-zinc-800" };
  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${m.cls}`}>
      {m.icon}
    </div>
  );
}

/* ──────────────────────────────────────────
   Section card wrapper
────────────────────────────────────────── */
function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {children}
    </div>
  );
}

/* ──────────────────────────────────────────
   Info row for the sidebar
────────────────────────────────────────── */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-xs text-(--text-muted)">{label}</span>
      <span className="text-xs font-semibold text-(--text)">{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5 pb-14">
      <div className="h-28 animate-pulse rounded-2xl bg-orange-50 dark:bg-orange-950/10" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1,2,3,4].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-zinc-800" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-800" />
          <div className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-800" />
        </div>
        <div className="space-y-4">
          <div className="h-36 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-800" />
          <div className="h-56 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   PAGE
══════════════════════════════════════════ */
export default function TransferDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const isInvalidId = !id || id === "undefined";

  const [transfer, setTransfer]             = useState<FullTransfer | null>(null);
  const [loading,  setLoading]              = useState(!isInvalidId);
  const [notFound, setNotFound]             = useState(isInvalidId);
  const [copied,   setCopied]               = useState(false);
  const [showAllViewers, setShowAllViewers] = useState(false);
  const [actionLoading, setActionLoading]   = useState<"disable" | "enable" | "delete" | "extend" | null>(null);
  const [refreshKey, setRefreshKey]         = useState(0);
  /* Capture current time once at mount — avoids calling Date.now() during render */
  const [mountedAt]                         = useState(Date.now);

  /* ── All derived values must be before any early return (Rules of Hooks) ── */
  const daysLeft = transfer?.expiresAt
    ? Math.ceil((new Date(transfer.expiresAt).getTime() - mountedAt) / 86_400_000)
    : null;

  const shareLink = transfer ? getTransferLink(transfer) : "";

  const viewers        = transfer?.viewerDetails ?? [];
  const activities     = transfer?.activity ?? [];
  const visibleViewers = showAllViewers ? viewers : viewers.slice(0, 5);
  const isExpired      = transfer
    ? (transfer.status === "expired" || (daysLeft !== null && daysLeft < 0))
    : false;
  const isReceived = !!transfer?.isReceived;
  const fileCount = transfer ? getTransferFileCount(transfer) : 0;
  const totalSize = transfer ? getTransferTotalSize(transfer) : 0;
  const senderName = transfer ? getTransferSenderLabel(transfer) : "";
  const senderEmail = transfer ? getTransferSenderEmail(transfer) : undefined;

  /* ── Fetch transfer — no synchronous setState in the effect body ── */
  useEffect(() => {
    if (isInvalidId) return;
    let cancelled = false;

    transfersApi.getById(id).then((res) => {
      if (cancelled) return;
      const data = res.data?.transfer ?? res.data?.data ?? res.data;
      if (data) setTransfer(data as FullTransfer);
      else setNotFound(true);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) { setNotFound(true); setLoading(false); }
    });

    return () => { cancelled = true; };
  }, [id, refreshKey, isInvalidId]);

  /* ── Actions ── */
  const handleDisable = async () => {
    if (!transfer) return;
    setActionLoading("disable");
    try {
      await transfersApi.disable(id);
      setTransfer((p) => p ? { ...p, status: "disabled" } : p);
      showToast.success("Transfer disabled");
    } catch { showToast.error("Failed to disable transfer"); }
    setActionLoading(null);
  };

  const handleEnable = async () => {
    if (!transfer) return;
    setActionLoading("enable");
    try {
      await transfersApi.enable(id);
      setTransfer((p) => p ? { ...p, status: "active" } : p);
      showToast.success("Transfer re-enabled");
    } catch { showToast.error("Failed to enable transfer"); }
    setActionLoading(null);
  };

  const handleExtend = async (days = 7) => {
    setActionLoading("extend");
    try {
      const res = await transfersApi.extend(id, days);
      const newExpiry = res.data?.data?.expiresAt;
      showToast.success(`Expiry extended by ${days} days`);
      if (newExpiry) {
        setTransfer((p) => p ? { ...p, expiresAt: newExpiry, status: "active" } : p);
      } else {
        setRefreshKey((k) => k + 1);
      }
    } catch { showToast.error("Failed to extend expiry"); }
    setActionLoading(null);
  };

  const handleDelete = async () => {
    setActionLoading("delete");
    try {
      await transfersApi.delete(id);
      showToast.success("Transfer deleted");
      router.push("/transfers");
    } catch { showToast.error("Failed to delete transfer"); }
    setActionLoading(null);
  };

  const handleCopy = () => {
    if (!transfer) return;
    navigator.clipboard?.writeText(shareLink).catch(() => showToast.error("Unable to copy link"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast.success("Link copied");
  };

  /* ── Loading / not found ── */
  if (loading) {
    return (
      <AuthGuard>
        <DashboardLayout>
          <div className="animate-fade-in px-0 pt-0">
            <LoadingSkeleton />
          </div>
        </DashboardLayout>
      </AuthGuard>
    );
  }

  if (notFound || !transfer) {
    return (
      <AuthGuard>
        <DashboardLayout>
          <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-50 dark:bg-zinc-800">
              <Send size={28} className="text-gray-300 dark:text-zinc-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-(--text)">Transfer not found</p>
              <p className="mt-1 text-sm text-(--text-muted)">This transfer may have been deleted or expired.</p>
            </div>
            <Link href="/transfers"
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:bg-orange-600">
              <ArrowLeft size={14} /> Back to Transfers
            </Link>
          </div>
        </DashboardLayout>
      </AuthGuard>
    );
  }

  /* ── Stat cards ── */
  const STATS = [
    { label: "Total Views",  value: transfer.views ?? 0,             icon: <Eye size={16} />,      gradient: "from-purple-500 to-violet-500" },
    { label: "Downloads",    value: transfer.downloads ?? 0,         icon: <Download size={16} />, gradient: "from-blue-500 to-cyan-500" },
    { label: isReceived ? "Sender" : "Recipients", value: isReceived ? senderName : transfer.recipients?.length ?? 0, icon: <Users size={16} />, gradient: "from-orange-500 to-amber-500" },
    {
      label: "Days Left",
      value: daysLeft === null ? "∞" : daysLeft > 0 ? `${daysLeft}d` : "Expired",
      icon: <Clock size={16} />,
      gradient: (daysLeft !== null && daysLeft <= 2) ? "from-red-500 to-rose-600" : "from-emerald-500 to-green-600",
    },
  ];

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-5 pb-14">

          {/* ── Hero header ── */}
          <div className="relative overflow-hidden rounded-2xl border border-orange-200/50 bg-linear-to-br from-orange-50 via-amber-50/40 to-white px-6 py-6 dark:border-orange-900/20 dark:from-orange-950/25 dark:via-amber-900/10 dark:to-zinc-900/0">
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-orange-400/10 blur-3xl" />

            {/* Back link */}
            <Link href="/transfers"
              className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-(--text-muted) transition-colors hover:text-orange-500">
              <ArrowLeft size={13} /> Back to Transfers
            </Link>

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-orange-500 to-amber-500 text-white shadow-xl shadow-orange-500/25">
                  <Send size={22} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-extrabold tracking-tight text-(--text)">
                      {transfer.title || `Transfer ${id.slice(-8)}`}
                    </h1>
                    <StatusBadge status={transfer.status} />
                    <MethodBadge method={transfer.method} />
                  </div>
                  {transfer.subject && (
                    <p className="mt-0.5 text-sm text-(--text-muted)">
                      Subject: <span className="italic">&ldquo;{transfer.subject}&rdquo;</span>
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px] text-(--text-muted)">
                      <CloudUpload size={10} className="text-sky-500" /> Cloudflare R2
                    </span>
                    <span className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                    <span className="flex items-center gap-1 text-[11px] text-(--text-muted)">
                      <Zap size={10} className="text-orange-500" /> Sent {formatRelative(transfer.createdAt)}
                    </span>
                    {isReceived && (
                      <>
                        <span className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                        <span className="flex items-center gap-1 text-[11px] text-(--text-muted)">
                          <Users size={10} className="text-blue-500" /> From {senderName}
                        </span>
                      </>
                    )}
                    {transfer.hasPassword && (
                      <>
                        <span className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                        <span className="flex items-center gap-1 text-[11px] text-orange-500">
                          <Lock size={10} /> Password Protected
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" onClick={handleCopy} title="Copy share link"
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2 text-xs font-semibold text-(--text-muted) shadow-sm backdrop-blur-sm transition-colors hover:text-(--text) dark:border-zinc-700/60 dark:bg-zinc-900/80">
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? "Copied!" : "Copy Link"}
                </button>

                {!isReceived && transfer.status === "active" && (
                  <button type="button" onClick={() => handleExtend(7)}
                    disabled={actionLoading === "extend"}
                    className="flex items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2 text-xs font-semibold text-(--text-muted) shadow-sm backdrop-blur-sm transition-colors hover:text-(--text) disabled:opacity-50 dark:border-zinc-700/60 dark:bg-zinc-900/80">
                    <RefreshCw size={12} className={actionLoading === "extend" ? "animate-spin" : ""} />
                    Extend 7d
                  </button>
                )}

                {!isReceived && transfer.status === "active" && (
                  <button type="button" onClick={handleDisable}
                    disabled={actionLoading === "disable"}
                    className="flex items-center gap-1.5 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-100 disabled:opacity-50 dark:border-orange-900/30 dark:bg-orange-900/10 dark:text-orange-400">
                    <ToggleLeft size={12} />
                    {actionLoading === "disable" ? "Disabling…" : "Disable"}
                  </button>
                )}

                {!isReceived && transfer.status === "disabled" && (
                  <button type="button" onClick={handleEnable}
                    disabled={actionLoading === "enable"}
                    className="flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:text-emerald-400">
                    <ToggleRight size={12} />
                    {actionLoading === "enable" ? "Enabling…" : "Re-enable"}
                  </button>
                )}

                {!isReceived && (
                  <button type="button" onClick={handleDelete}
                    disabled={actionLoading === "delete"}
                    className="flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
                    <Trash2 size={12} />
                    {actionLoading === "delete" ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Expiry warning ── */}
          {!isReceived && daysLeft !== null && daysLeft >= 0 && daysLeft <= 2 && transfer.status === "active" && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/10">
              <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="flex-1 text-sm font-medium text-amber-800 dark:text-amber-300">
                Transfer expires {daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft > 1 ? "s" : ""}`}
                <span className="ml-1 font-normal opacity-80">— extend the expiry to keep it accessible.</span>
              </p>
              <button type="button" onClick={() => handleExtend(7)}
                className="shrink-0 text-xs font-bold text-orange-600 transition-colors hover:text-orange-700 dark:text-orange-400">
                Extend 7d →
              </button>
            </div>
          )}

          {/* ── Stats row ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}
                className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900">
                <div className="pointer-events-none absolute right-0 top-0 h-16 w-16 translate-x-5 -translate-y-5 rounded-full bg-gray-50 dark:bg-zinc-800/40" />
                <div className={`relative mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br ${s.gradient} text-white shadow-sm`}>
                  {s.icon}
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">{s.label}</p>
                <p className="mt-0.5 text-xl font-bold text-(--text)">{s.value}</p>
                <TrendingUp size={10} className="absolute bottom-3 right-3 text-gray-200 dark:text-zinc-700" />
              </div>
            ))}
          </div>

          {/* ── Main grid ── */}
          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">

            {/* ── Left column ── */}
            <div className="space-y-5">

              {/* Files — folder-aware tree */}
              {(() => {
                const { rootFiles, folders } = buildTransferFolderTree(transfer.files);
                const hasFolders = folders.length > 0;
                return (
                  <SectionCard>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                      <div>
                        <h2 className="font-bold text-(--text)">Files</h2>
                        <p className="text-xs text-(--text-muted)">
                          {fileCount} file{fileCount !== 1 ? "s" : ""}
                          {hasFolders && ` in ${folders.length} folder${folders.length !== 1 ? "s" : ""}`}
                          {" · "}{formatBytes(totalSize)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasFolders && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                            <Folder size={10} /> {folders.length} folder{folders.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-xs font-bold text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
                          {fileCount}
                        </span>
                      </div>
                    </div>

                    {/* Tree body */}
                    <div className="divide-y divide-gray-50/80 dark:divide-zinc-800/40">
                      {/* Folders first */}
                      {folders.map((folder) => (
                        <TransferFolderNode key={folder.path} node={folder} depth={0} />
                      ))}
                      {/* Root-level flat files */}
                      {rootFiles.map((f) => (
                        <TransferFileRow key={f.id} file={f} />
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-zinc-800">
                      <span className="text-xs text-(--text-muted)">{formatBytes(totalSize)} total</span>
                      <a href={shareLink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold text-orange-500 transition-colors hover:text-orange-600">
                        <ExternalLink size={11} /> Open Transfer Page
                      </a>
                    </div>
                  </SectionCard>
                );
              })()}

              {/* Viewer Details */}
              <SectionCard>
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                  <div>
                    <h2 className="font-bold text-(--text)">Viewer Details</h2>
                    <p className="text-xs text-(--text-muted)">Who has opened this transfer</p>
                  </div>
                  <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                    {viewers.length} view{viewers.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {viewers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-zinc-800">
                      <Eye size={20} className="text-gray-300 dark:text-zinc-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-(--text)">No views yet</p>
                      <p className="mt-0.5 text-xs text-(--text-muted)">Viewer details will appear once someone opens this transfer.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-160">
                        <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-zinc-800 dark:bg-zinc-800/30">
                          <tr>
                            {["Viewer", "Device / Browser", "Location · IP", "Time", "Action"].map((h, i) => (
                              <th key={h} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-(--text-muted) ${i > 0 ? "text-left" : "text-left"}`}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/40">
                          {visibleViewers.map((v) => (
                            <tr key={v.id} className="transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                              <td className="px-5 py-3.5">
                                <p className="text-sm font-semibold text-(--text)">{v.name ?? "Anonymous"}</p>
                                <p className="text-[11px] text-(--text-muted)">{v.email ?? "—"}</p>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1.5 text-xs text-(--text-muted)">
                                  {v.device === "Mobile" ? <Smartphone size={11} /> : <Monitor size={11} />}
                                  {v.browser ?? "—"}
                                </div>
                                <p className="text-[11px] text-(--text-muted)">{v.os ?? ""}</p>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1 text-xs text-(--text-muted)">
                                  <MapPin size={10} className="shrink-0" /> {v.location ?? "Unknown"}
                                </div>
                                <p className="font-mono text-[10px] text-(--text-muted)">{v.ip}</p>
                              </td>
                              <td className="px-5 py-3.5">
                                <p className="whitespace-nowrap text-xs text-(--text-muted)">{formatRelative(v.viewedAt)}</p>
                                {v.downloadedAt && (
                                  <p className="text-[10px] text-blue-500">↓ {formatRelative(v.downloadedAt)}</p>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                  v.action === "download"
                                    ? "border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400"
                                    : "border-purple-100 bg-purple-50 text-purple-600 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400"
                                }`}>
                                  {v.action === "download" ? <Download size={8} /> : <Eye size={8} />}
                                  {v.action.charAt(0).toUpperCase() + v.action.slice(1)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {viewers.length > 5 && (
                      <button type="button" onClick={() => setShowAllViewers(!showAllViewers)}
                        className="flex w-full items-center justify-center gap-1.5 border-t border-gray-100 py-3 text-xs font-semibold text-orange-500 transition-colors hover:bg-orange-50/40 dark:border-zinc-800 dark:hover:bg-orange-900/10">
                        {showAllViewers
                          ? <><ChevronUp size={12} /> Show less</>
                          : <><ChevronDown size={12} /> Show {viewers.length - 5} more</>}
                      </button>
                    )}
                  </>
                )}
              </SectionCard>

              {/* Activity Timeline */}
              <SectionCard>
                <div className="border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                  <h2 className="font-bold text-(--text)">Activity Timeline</h2>
                  <p className="text-xs text-(--text-muted)">Complete history of events for this transfer</p>
                </div>

                {activities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-zinc-800">
                      <Activity size={20} className="text-gray-300 dark:text-zinc-600" />
                    </div>
                    <p className="text-sm font-semibold text-(--text)">No activity yet</p>
                  </div>
                ) : (
                  <div className="p-5">
                    <div className="relative space-y-4">
                      <div className="absolute left-3.5 top-3 h-[calc(100%-24px)] w-px bg-gray-100 dark:bg-zinc-800" />
                      {activities.map((a) => (
                        <div key={a.id} className="relative flex items-start gap-3.5 pl-9">
                          <div className="absolute left-0 top-0">
                            <ActivityIcon action={a.action} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-(--text)">{a.description}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-(--text-muted)">
                              <span>{formatRelative(a.createdAt)}</span>
                              {a.location && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin size={9} /> {a.location}
                                </span>
                              )}
                              {a.ip && <span className="font-mono">{a.ip}</span>}
                              {a.actorEmail && <span>{a.actorEmail}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* ── Right sidebar ── */}
            <div className="space-y-4">

              {/* Share Link card */}
              <SectionCard>
                <div className="border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                  <h3 className="font-bold text-(--text)">Share Link</h3>
                </div>
                <div className="p-5 space-y-3">
                  <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50 dark:border-zinc-700/60 dark:bg-zinc-800/50">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <LinkIcon size={11} className="shrink-0 text-orange-500" />
                      <span className="flex-1 truncate font-mono text-xs text-(--text-muted)">{shareLink}</span>
                    </div>
                    <div className="flex divide-x divide-gray-100 border-t border-gray-100 dark:divide-zinc-700/60 dark:border-zinc-700/60">
                      <button type="button" onClick={handleCopy}
                        className="flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold text-(--text-muted) transition-colors hover:bg-gray-100 hover:text-(--text) dark:hover:bg-zinc-700/50">
                        {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                        {copied ? "Copied!" : "Copy"}
                      </button>
                      <a href={shareLink} target="_blank" rel="noopener noreferrer"
                        className="flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold text-(--text-muted) transition-colors hover:bg-gray-100 hover:text-(--text) dark:hover:bg-zinc-700/50">
                        <ExternalLink size={11} /> Open
                      </a>
                    </div>
                  </div>

                  {!isReceived && transfer.status === "active" && (
                    <button type="button" onClick={handleDisable} disabled={actionLoading === "disable"}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-100 py-2.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/20 dark:hover:bg-red-900/10">
                      <ToggleLeft size={12} /> Disable Link
                    </button>
                  )}
                  {!isReceived && transfer.status === "disabled" && (
                    <button type="button" onClick={handleEnable} disabled={actionLoading === "enable"}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-100 py-2.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/20 dark:hover:bg-emerald-900/10">
                      <ToggleRight size={12} /> Re-enable Link
                    </button>
                  )}
                </div>
              </SectionCard>

              {/* Transfer Info */}
              <SectionCard>
                <div className="border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                  <h3 className="font-bold text-(--text)">Transfer Info</h3>
                </div>
                <div className="divide-y divide-gray-50 px-5 dark:divide-zinc-800/60">
                  <InfoRow label="Method"    value={<MethodBadge method={transfer.method} />} />
                  <InfoRow label="Privacy"   value={<PrivacyBadge privacy={transfer.privacy} />} />
                  <InfoRow label="Password"  value={
                    transfer.hasPassword
                      ? <span className="flex items-center gap-1 text-orange-500"><Lock size={10} /> Protected</span>
                      : <span className="flex items-center gap-1 text-(--text-muted)"><Unlock size={10} /> None</span>
                  } />
                  <InfoRow label="Files"     value={`${fileCount} · ${formatBytes(totalSize)}`} />
                  <InfoRow label="Created"   value={formatRelative(transfer.createdAt)} />
                  <InfoRow label="Expires"   value={
                    transfer.expiresAt
                      ? <span className={isExpired ? "font-bold text-red-500" : daysLeft !== null && daysLeft <= 3 ? "font-bold text-amber-500" : ""}>
                          {formatRelative(transfer.expiresAt)}
                        </span>
                      : "Never"
                  } />
                  <InfoRow label="Last Seen" value={transfer.lastViewedAt ? formatRelative(transfer.lastViewedAt) : "—"} />
                  <InfoRow label="Last DL"   value={transfer.lastDownloadedAt ? formatRelative(transfer.lastDownloadedAt) : "—"} />
                </div>
              </SectionCard>

              {/* Sender / Recipients */}
              <SectionCard>
                <div className="border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-(--text)">{isReceived ? "Sender" : "Recipients"}</h3>
                    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
                      {isReceived ? "1" : transfer.recipients?.length ?? 0}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  {isReceived ? (
                    <div className="flex items-center gap-3 rounded-xl bg-blue-50/80 px-3 py-2.5 dark:bg-blue-900/10">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                        {senderName[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-(--text)">{senderName}</p>
                        {senderEmail && senderEmail !== senderName && (
                          <p className="truncate text-[10px] text-(--text-muted)">{senderEmail}</p>
                        )}
                      </div>
                    </div>
                  ) : !transfer.recipients?.length ? (
                    <p className="text-xs text-(--text-muted)">No specific recipients — shared via link</p>
                  ) : (
                    <div className="space-y-2">
                      {transfer.recipients.map((r) => {
                        const viewed     = viewers.some((v) => v.email === r);
                        const downloaded = viewers.some((v) => v.email === r && v.action === "download");
                        return (
                          <div key={r} className="flex items-center gap-3 rounded-xl bg-gray-50/80 px-3 py-2.5 dark:bg-zinc-800/50">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                              {r[0].toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-(--text)">{r}</p>
                              <p className="text-[10px] text-(--text-muted)">
                                {downloaded ? "Downloaded" : viewed ? "Viewed" : "Not opened"}
                              </p>
                            </div>
                            <div className={`h-2 w-2 shrink-0 rounded-full ${downloaded ? "bg-blue-400" : viewed ? "bg-emerald-500" : "bg-gray-200 dark:bg-zinc-700"}`} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Message */}
              {transfer.message && (
                <SectionCard>
                  <div className="border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                    <h3 className="font-bold text-(--text)">Message</h3>
                  </div>
                  <div className="p-5">
                    <p className="text-sm leading-relaxed text-(--text-muted)">{transfer.message}</p>
                  </div>
                </SectionCard>
              )}

              {/* Danger zone */}
              {!isReceived && (
                <SectionCard>
                  <div className="border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                    <h3 className="font-bold text-red-500">Danger Zone</h3>
                  </div>
                  <div className="p-5">
                    <button type="button" onClick={handleDelete}
                      disabled={actionLoading === "delete"}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20">
                      <Trash2 size={13} />
                      {actionLoading === "delete" ? "Deleting…" : "Delete Transfer"}
                    </button>
                    <p className="mt-2 text-center text-[10px] text-(--text-muted)">This action cannot be undone.</p>
                  </div>
                </SectionCard>
              )}

            </div>
          </div>

        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
