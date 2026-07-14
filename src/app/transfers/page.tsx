"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Send, Eye, Download, Clock, CheckCircle, XCircle, Search,
  ArrowUpRight, MoreHorizontal, Link as LinkIcon, Copy,
  Check, Trash2, RefreshCw, Users, Shield, Lock,
  Star, Inbox, TrendingUp, X, Mail, QrCode,
  Zap, ExternalLink, ToggleLeft, ToggleRight,
  CloudUpload, Sparkles,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { Spinner } from "@/components/ui";
import Button from "@/components/ui/Button";
import { formatBytes, formatRelative } from "@/lib/utils";
import {
  getTransferFileCount,
  getTransferLink,
  getTransferSenderEmail,
  getTransferSenderLabel,
  getTransfersFromResponse,
  getTransferTotalSize,
} from "@/lib/transfers";
import { transfersApi, linksApi } from "@/lib/api";
import { listenAppDataChanged } from "@/lib/app-events";
import { showToast } from "@/lib/toast";
import { Transfer } from "@/types";

/* ──────────────────────────────────────────
   Types
────────────────────────────────────────── */
type ViewTab    = "sent" | "received" | "starred";
type StatusFilter = "all" | "active" | "expired" | "disabled";

interface TransferStats {
  totalTransfers: number;
  selfTransfers:  number;
  totalUsers:     number;
  receivedMails:  number;
  starredMails:   number;
  activeLinks:    number;
}

/* ──────────────────────────────────────────
   Method icon helper
────────────────────────────────────────── */
function MethodBadge({ method }: { method?: string }) {
  const cfg: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    email:     { icon: <Mail size={10} />,         label: "Email",     cls: "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30" },
    link:      { icon: <LinkIcon size={10} />,      label: "Link",      cls: "bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-900/30" },
    qr:        { icon: <QrCode size={10} />,        label: "QR",        cls: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30" },
  };
  const m = method ? cfg[method.toLowerCase()] : undefined;
  if (!m) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>
      {m.icon} {m.label}
    </span>
  );
}

/* ──────────────────────────────────────────
   Status badge
────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    active:   { cls: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30", icon: <CheckCircle size={9} /> },
    expired:  { cls: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-zinc-800 dark:text-gray-400 dark:border-zinc-700", icon: <Clock size={9} /> },
    disabled: { cls: "bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30", icon: <XCircle size={9} /> },
    pending:  { cls: "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30", icon: <Clock size={9} /> },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
      {cfg.icon} {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/* ──────────────────────────────────────────
   Skeleton row
────────────────────────────────────────── */
function SkeletonRow() {
  return (
    <tr>
      {[80, 60, 40, 40, 30, 30, 50, 30].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div className={`h-3.5 w-${w > 60 ? "full" : w > 40 ? "3/4" : "1/2"} animate-pulse rounded-md bg-gray-100 dark:bg-zinc-800`} />
        </td>
      ))}
    </tr>
  );
}

/* ──────────────────────────────────────────
   Stat card
────────────────────────────────────────── */
function StatCard({ label, value, icon, gradient, loading }: {
  label: string; value: number; icon: React.ReactNode; gradient: string; loading: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="pointer-events-none absolute right-0 top-0 h-16 w-16 translate-x-5 -translate-y-5 rounded-full bg-gray-50 dark:bg-zinc-800/40" />
      <div className={`relative mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br ${gradient} text-white shadow-sm`}>
        {icon}
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">{label}</p>
      {loading
        ? <div className="mt-1 h-5 w-10 animate-pulse rounded-md bg-gray-100 dark:bg-zinc-800" />
        : <p className="mt-0.5 text-lg font-bold text-(--text)">{value.toLocaleString()}</p>}
      <TrendingUp size={10} className="absolute bottom-3 right-3 text-gray-200 dark:text-zinc-700" />
    </div>
  );
}

/* ══════════════════════════════════════════
   PAGE
══════════════════════════════════════════ */
export default function TransfersPage() {
  const [viewTab, setViewTab]           = useState<ViewTab>("sent");
  const [transfers, setTransfers]       = useState<Transfer[]>([]);
  const [loading, setLoading]           = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<TransferStats>({
    totalTransfers: 0, selfTransfers: 0, totalUsers: 0,
    receivedMails: 0, starredMails: 0, activeLinks: 0,
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch]             = useState("");
  const [copiedId, setCopiedId]         = useState<string | null>(null);
  const [menuOpen, setMenuOpen]         = useState<string | null>(null);
  const [starredIds, setStarredIds]     = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /* ── Close dropdown on outside click ── */
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const fn = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(null);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [menuOpen]);

  /* ── Load stats ── */
  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await transfersApi.getStats();
      const d   = res.data?.data ?? res.data ?? {};
      setStats({
        totalTransfers: d.totalTransfers ?? 0,
        selfTransfers:  d.selfTransfers  ?? 0,
        totalUsers:     d.totalUsers     ?? 0,
        receivedMails:  d.receivedMails  ?? 0,
        starredMails:   d.starredMails   ?? 0,
        activeLinks:    d.activeLinks    ?? 0,
      });
    } catch { /* silently ignore */ } finally { setStatsLoading(false); }
  }, []);

  /* ── Load transfers by tab ── */
  const load = useCallback(async (tab: ViewTab = "sent") => {
    try {
      setLoading(true);
      let res;
      if (tab === "received") {
        res = await transfersApi.received({ limit: 100 });
      } else if (tab === "starred") {
        res = await transfersApi.starred({ limit: 100 });
      } else {
        res = await transfersApi.list({ limit: 100 });
      }
      const list = getTransfersFromResponse(res.data);
      setTransfers(list);
      /* Seed local starred set from server-side isStarred so icons render correctly on first paint */
      setStarredIds(new Set(list.filter((t) => t.isStarred).map((t) => t.id)));
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { load(viewTab); }, [load, viewTab]);
  useEffect(() => {
    return listenAppDataChanged((detail) => {
      if (detail.transfers || detail.files || detail.folders || detail.storage) {
        void loadStats();
        void load(viewTab);
      }
    });
  }, [load, loadStats, viewTab]);

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    let list = transfers;
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.sender?.name?.toLowerCase().includes(q) ||
          t.sender?.email?.toLowerCase().includes(q) ||
          t.recipients?.some((r) => r.toLowerCase().includes(q)) ||
          t.files?.some((f) => f.name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [transfers, statusFilter, search]);

  /* ── Status counts ── */
  const counts = useMemo(() => ({
    all:      transfers.length,
    active:   transfers.filter((t) => t.status === "active").length,
    expired:  transfers.filter((t) => t.status === "expired").length,
    disabled: transfers.filter((t) => t.status === "disabled").length,
  }), [transfers]);

  /* ── Helpers ── */
  function getLink(t: Transfer): string {
    return getTransferLink(t);
  }

  const handleCopy = (t: Transfer) => {
    const url = getLink(t);
    navigator.clipboard?.writeText(url).catch(() => showToast.error("Unable to copy link"));
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast.success("Link copied to clipboard");
  };

  const handleStar = async (t: Transfer) => {
    const isCurrentlyStarred = starredIds.has(t.id);
    setActionLoading(t.id);
    try {
      if (isCurrentlyStarred) {
        await transfersApi.unstar(t.id);
      } else {
        await transfersApi.star(t.id);
      }
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
        return next;
      });
      if (viewTab === "starred") {
        setTransfers((prev) => prev.filter((x) => x.id !== t.id));
      }
      showToast.success(isCurrentlyStarred ? "Removed from starred" : "Added to starred");
    } catch { showToast.error("Failed to update star"); }
    setActionLoading(null);
    setMenuOpen(null);
  };

  const handleDisable = async (t: Transfer) => {
    setActionLoading(t.id);
    try {
      if (t.link?.id) {
        await linksApi.disable(t.link.id);
      } else {
        await transfersApi.delete(t.id);
      }
      setTransfers((prev) => prev.map((x) => x.id === t.id ? { ...x, status: "disabled" } : x));
      showToast.success("Transfer disabled");
    } catch { showToast.error("Failed to disable transfer"); }
    setActionLoading(null);
    setMenuOpen(null);
  };

  const handleEnable = async (t: Transfer) => {
    setActionLoading(t.id);
    try {
      if (t.link?.id) {
        await linksApi.enable(t.link.id);
        setTransfers((prev) => prev.map((x) => x.id === t.id ? { ...x, status: "active" } : x));
        showToast.success("Transfer re-enabled");
      }
    } catch { showToast.error("Failed to enable transfer"); }
    setActionLoading(null);
    setMenuOpen(null);
  };

  const handleExtend = async (t: Transfer, days = 7) => {
    setActionLoading(t.id);
    try {
      if (t.link?.id) {
        await linksApi.renew(t.link.id, days);
        showToast.success(`Expiry extended by ${days} days`);
        load(viewTab);
      }
    } catch { showToast.error("Failed to extend expiry"); }
    setActionLoading(null);
    setMenuOpen(null);
  };

  const handleDelete = async (t: Transfer) => {
    setActionLoading(t.id);
    try {
      await transfersApi.delete(t.id);
      setTransfers((prev) => prev.filter((x) => x.id !== t.id));
      showToast.success("Transfer deleted");
    } catch { showToast.error("Failed to delete transfer"); }
    setActionLoading(null);
    setMenuOpen(null);
  };

  const VIEW_TABS: { value: ViewTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { value: "sent",     label: "Sent",     icon: <Send size={13} />,  count: viewTab === "sent"     ? transfers.length : undefined },
    { value: "received", label: "Received", icon: <Inbox size={13} />, count: viewTab === "received" ? transfers.length : undefined },
    { value: "starred",  label: "Starred",  icon: <Star size={13} />,  count: viewTab === "starred"  ? transfers.length : undefined },
  ];

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: "all",      label: "All" },
    { value: "active",   label: "Active" },
    { value: "expired",  label: "Expired" },
    { value: "disabled", label: "Disabled" },
  ];

  const STAT_CARDS = [
    { label: "Total Sent",  value: stats.totalTransfers, icon: <Send size={15} />,       gradient: "from-orange-500 to-amber-500"  },
    { label: "Received",    value: stats.receivedMails,  icon: <Inbox size={15} />,      gradient: "from-blue-500 to-blue-600"     },
    { label: "Active Links",value: stats.activeLinks,    icon: <LinkIcon size={15} />,   gradient: "from-emerald-500 to-green-600" },
    { label: "Starred",     value: stats.starredMails,   icon: <Star size={15} />,       gradient: "from-amber-500 to-yellow-500"  },
  ];

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-5 pb-14">

          {/* ── Hero ── */}
          <div className="relative overflow-hidden rounded-2xl border border-orange-200/50 bg-linear-to-br from-orange-50 via-amber-50/40 to-white px-6 py-6 dark:border-orange-900/20 dark:from-orange-950/25 dark:via-amber-900/10 dark:to-zinc-900/0">
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-orange-400/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-8 left-16 h-32 w-32 rounded-full bg-amber-400/8 blur-2xl" />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-orange-500 to-amber-500 text-white shadow-xl shadow-orange-500/25">
                  <Send size={22} />
                  <div className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white shadow-sm dark:bg-zinc-900">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-extrabold tracking-tight text-(--text)">Transfers</h1>
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                      <Sparkles size={9} /> R2 Powered
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-(--text-muted)">Manage your sent, received and starred file transfers</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px] text-(--text-muted)"><CloudUpload size={10} className="text-sky-500" /> Cloudflare R2</span>
                    <span className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                    <span className="flex items-center gap-1 text-[11px] text-(--text-muted)"><Shield size={10} className="text-emerald-500" /> Encrypted</span>
                    <span className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                    <span className="flex items-center gap-1 text-[11px] text-(--text-muted)"><Zap size={10} className="text-amber-500" /> Fast delivery</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => load(viewTab)}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white/80 px-3.5 py-2 text-xs font-semibold text-(--text-muted) shadow-sm backdrop-blur-sm transition-colors hover:text-(--text) disabled:opacity-50 dark:border-zinc-700/60 dark:bg-zinc-900/80">
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
                <Link href="/transfers/send">
                  <Button leftIcon={<Send size={14} />} size="sm" rounded="xl">
                    New Transfer
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAT_CARDS.map((s) => (
              <StatCard key={s.label} {...s} loading={statsLoading} />
            ))}
          </div>

          {/* ── View tabs ── */}
          <div className="flex items-center gap-1 rounded-2xl border border-gray-200/70 bg-gray-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/60 w-fit">
            {VIEW_TABS.map((tab) => (
              <button key={tab.value} type="button"
                onClick={() => { setViewTab(tab.value); setStatusFilter("all"); setSearch(""); }}
                className={[
                  "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150",
                  viewTab === tab.value
                    ? "bg-white text-orange-600 shadow-sm dark:bg-zinc-800 dark:text-orange-400"
                    : "text-(--text-muted) hover:text-(--text)",
                ].join(" ")}>
                <span className={viewTab === tab.value ? "text-orange-500" : ""}>{tab.icon}</span>
                {tab.label}
                {tab.count !== undefined && (
                  <span className={[
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    viewTab === tab.value
                      ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                      : "bg-gray-200 text-gray-500 dark:bg-zinc-700 dark:text-gray-400",
                  ].join(" ")}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Filters row ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Status sub-filter */}
            <div className="flex items-center gap-1 rounded-xl border border-gray-200/60 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
              {STATUS_TABS.map((tab) => (
                <button key={tab.value} type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={[
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    statusFilter === tab.value
                      ? "bg-gray-100 text-(--text) dark:bg-zinc-800"
                      : "text-(--text-muted) hover:text-(--text)",
                  ].join(" ")}>
                  {tab.label}
                  <span className={[
                    "rounded-full px-1.5 text-[10px] font-bold",
                    statusFilter === tab.value ? "text-orange-500" : "text-(--text-muted)",
                  ].join(" ")}>
                    {counts[tab.value]}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, file or recipient…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-8 pr-8 text-sm text-(--text) outline-none transition-all placeholder:text-gray-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 dark:border-zinc-700 dark:bg-zinc-900 sm:w-68"
              />
              {search && (
                <button type="button" aria-label="Clear search" onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* ── Table card ── */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 dark:bg-zinc-800">
                  {search
                    ? <Search size={22} className="text-gray-300 dark:text-zinc-600" />
                    : viewTab === "received"
                      ? <Inbox size={22} className="text-gray-300 dark:text-zinc-600" />
                      : viewTab === "starred"
                        ? <Star size={22} className="text-gray-300 dark:text-zinc-600" />
                        : <Send size={22} className="text-gray-300 dark:text-zinc-600" />}
                </div>
                <div>
                  <p className="font-semibold text-(--text)">
                    {search ? "No transfers match your search"
                      : viewTab === "received" ? "No received transfers"
                      : viewTab === "starred"  ? "No starred transfers"
                      : statusFilter !== "all" ? `No ${statusFilter} transfers`
                      : "No transfers yet"}
                  </p>
                  <p className="mt-0.5 text-sm text-(--text-muted)">
                    {search ? "Try a different keyword"
                      : viewTab === "sent" ? "Send your first transfer to get started"
                      : "They will appear here when available"}
                  </p>
                </div>
                {!search && viewTab === "sent" && (
                  <Link href="/transfers/send">
                    <Button size="sm" rounded="xl" leftIcon={<Send size={13} />}>New Transfer</Button>
                  </Link>
                )}
              </div>
            )}

            {(loading || filtered.length > 0) && (
              <>
                {/* ── Desktop table ── */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-175">
                    <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-zinc-800 dark:bg-zinc-800/30">
                      <tr>
                        {["Transfer", "Method", viewTab === "received" ? "Sender" : "Recipients", "Status", "Views", "Downloads", "Expires", "Actions"].map((h) => (
                          <th key={h} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-(--text-muted) ${h === "Actions" || h === "Views" || h === "Downloads" || h === "Status" ? "text-center" : "text-left"}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                      {loading
                        ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                        : filtered.map((t) => {
                          const isStarred  = starredIds.has(t.id);
                          const isExpired  = t.expiresAt ? new Date(t.expiresAt) < new Date() : false;
                          const isActing   = actionLoading === t.id;
                          const fileCount = getTransferFileCount(t);
                          const totalSize = getTransferTotalSize(t);

                          return (
                            <tr key={t.id} className="group transition-colors hover:bg-orange-50/30 dark:hover:bg-orange-500/5">

                              {/* Transfer */}
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className={[
                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                                    t.isReceived ? "bg-blue-50 text-blue-500 dark:bg-blue-900/20" : "bg-orange-50 text-orange-500 dark:bg-orange-900/20",
                                  ].join(" ")}>
                                    {t.isReceived ? <Inbox size={15} /> : <Send size={15} />}
                                  </div>
                                  <div className="min-w-0">
                                    <Link href={`/transfers/${t.id}`}
                                      className="block truncate font-semibold text-(--text) hover:text-orange-500 transition-colors max-w-[180px]">
                                      {t.title || `Transfer ${t.id.slice(-6)}`}
                                    </Link>
                                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-(--text-muted)">
                                      {fileCount} file{fileCount !== 1 ? "s" : ""} · {formatBytes(totalSize)}
                                      {t.hasPassword && <Lock size={9} className="text-orange-400" />}
                                      {isStarred && <Star size={9} className="fill-amber-400 text-amber-400" />}
                                    </p>
                                  </div>
                                </div>
                              </td>

                              {/* Method */}
                              <td className="px-5 py-3.5">
                                <MethodBadge method={(t as Transfer & { method?: string }).method} />
                              </td>

                              {/* Recipients */}
                              <td className="px-5 py-3.5">
                                {viewTab === "received" ? (
                                  <div className="max-w-[160px]">
                                    <p className="truncate text-xs font-semibold text-(--text)">
                                      {getTransferSenderLabel(t)}
                                    </p>
                                    {getTransferSenderEmail(t) && (
                                      <p className="truncate text-[11px] text-(--text-muted)">
                                        {getTransferSenderEmail(t)}
                                      </p>
                                    )}
                                  </div>
                                ) : t.recipients?.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {t.recipients.slice(0, 2).map((r) => (
                                      <p key={r} className="flex items-center gap-1 truncate text-xs text-(--text-muted) max-w-[140px]">
                                        <Users size={9} className="shrink-0 text-gray-300" /> {r}
                                      </p>
                                    ))}
                                    {t.recipients.length > 2 && (
                                      <p className="text-[10px] text-(--text-muted)">+{t.recipients.length - 2} more</p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-(--text-muted)">—</span>
                                )}
                              </td>

                              {/* Status */}
                              <td className="px-5 py-3.5 text-center">
                                <StatusBadge status={t.status} />
                              </td>

                              {/* Views */}
                              <td className="px-5 py-3.5 text-center">
                                <span className="flex items-center justify-center gap-1 text-sm font-semibold text-(--text-muted)">
                                  <Eye size={11} className="text-purple-400" /> {t.views ?? 0}
                                </span>
                              </td>

                              {/* Downloads */}
                              <td className="px-5 py-3.5 text-center">
                                <span className="flex items-center justify-center gap-1 text-sm font-semibold text-(--text-muted)">
                                  <Download size={11} className="text-blue-400" /> {t.downloads ?? 0}
                                </span>
                              </td>

                              {/* Expires */}
                              <td className="px-5 py-3.5">
                                {t.expiresAt ? (
                                  <div>
                                    <p className={`text-xs font-medium ${isExpired ? "text-red-500" : "text-(--text-muted)"}`}>
                                      {formatRelative(t.expiresAt)}
                                    </p>
                                    {isExpired && <p className="text-[10px] text-red-400">Expired</p>}
                                  </div>
                                ) : (
                                  <span className="text-xs text-(--text-muted)">Never</span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="px-5 py-3.5">
                                <div className="flex items-center justify-center gap-0.5" ref={menuOpen === t.id ? menuRef : null}>

                                  {/* Copy link */}
                                  <button type="button" title="Copy link"
                                    onClick={() => handleCopy(t)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-orange-500 dark:hover:bg-zinc-800">
                                    {copiedId === t.id
                                      ? <Check size={13} className="text-emerald-500" />
                                      : <Copy size={13} />}
                                  </button>

                                  {/* View details */}
                                  <Link href={`/transfers/${t.id}`} title="View details"
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-orange-500 dark:hover:bg-zinc-800">
                                    <ArrowUpRight size={13} />
                                  </Link>

                                  {/* Overflow menu */}
                                  <div className="relative">
                                    <button type="button" aria-label="More actions"
                                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === t.id ? null : t.id); }}
                                      className={[
                                        "flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800",
                                        isActing ? "opacity-50 pointer-events-none" : "",
                                      ].join(" ")}>
                                      {isActing ? <Spinner size={13} /> : <MoreHorizontal size={13} />}
                                    </button>

                                    {menuOpen === t.id && (
                                      <div className="absolute right-0 top-8 z-30 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                                        <button type="button" onClick={() => handleCopy(t)}
                                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-(--text-muted) transition-colors hover:bg-gray-50 hover:text-(--text) dark:hover:bg-zinc-800">
                                          <Copy size={12} /> Copy Link
                                        </button>
                                        <a href={getLink(t)} target="_blank" rel="noopener noreferrer"
                                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-(--text-muted) transition-colors hover:bg-gray-50 hover:text-(--text) dark:hover:bg-zinc-800">
                                          <ExternalLink size={12} /> Open Link
                                        </a>
                                        <button type="button" onClick={() => handleStar(t)}
                                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-(--text-muted) transition-colors hover:bg-gray-50 hover:text-(--text) dark:hover:bg-zinc-800">
                                          <Star size={12} className={isStarred ? "fill-amber-400 text-amber-400" : ""} />
                                          {isStarred ? "Unstar" : "Star"}
                                        </button>

                                        <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />

                                        {t.status === "active" && (
                                          <button type="button" onClick={() => handleDisable(t)}
                                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-(--text-muted) transition-colors hover:bg-gray-50 hover:text-(--text) dark:hover:bg-zinc-800">
                                            <ToggleLeft size={12} /> Disable Link
                                          </button>
                                        )}
                                        {t.status === "disabled" && (
                                          <button type="button" onClick={() => handleEnable(t)}
                                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-(--text-muted) transition-colors hover:bg-gray-50 hover:text-(--text) dark:hover:bg-zinc-800">
                                            <ToggleRight size={12} /> Enable Link
                                          </button>
                                        )}
                                        <button type="button" onClick={() => handleExtend(t, 7)}
                                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-(--text-muted) transition-colors hover:bg-gray-50 hover:text-(--text) dark:hover:bg-zinc-800">
                                          <RefreshCw size={12} /> Extend 7 Days
                                        </button>

                                        <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />
                                        <button type="button" onClick={() => handleDelete(t)}
                                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20">
                                          <Trash2 size={12} /> Delete Transfer
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {/* ── Mobile cards ── */}
                <div className="divide-y divide-gray-100 dark:divide-zinc-800 md:hidden">
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="space-y-2 p-4">
                          <div className="h-4 w-2/3 animate-pulse rounded-md bg-gray-100 dark:bg-zinc-800" />
                          <div className="h-3 w-1/2 animate-pulse rounded-md bg-gray-100 dark:bg-zinc-800" />
                        </div>
                      ))
                    : filtered.map((t) => {
                        const isStarred = starredIds.has(t.id);
                        const fileCount = getTransferFileCount(t);
                        const totalSize = getTransferTotalSize(t);
                        return (
                          <div key={t.id} className="p-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/30">
                            <div className="mb-3 flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <Link href={`/transfers/${t.id}`}
                                  className="block truncate font-semibold text-(--text) hover:text-orange-500 transition-colors">
                                  {t.title || `Transfer ${t.id.slice(-6)}`}
                                </Link>
                                <p className="mt-0.5 text-xs text-(--text-muted)">
                                  {fileCount} file{fileCount !== 1 ? "s" : ""} · {formatBytes(totalSize)} · {formatRelative(t.createdAt)}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <MethodBadge method={(t as Transfer & { method?: string }).method} />
                                <StatusBadge status={t.status} />
                              </div>
                            </div>
                            <div className="mb-3 flex items-center gap-4 text-xs text-(--text-muted)">
                              <span className="flex items-center gap-1"><Eye size={11} className="text-purple-400" />{t.views ?? 0}</span>
                              <span className="flex items-center gap-1"><Download size={11} className="text-blue-400" />{t.downloads ?? 0}</span>
                              {t.recipients?.length > 0 && (
                                <span className="flex items-center gap-1"><Users size={11} />{t.recipients.length} recipient{t.recipients.length !== 1 ? "s" : ""}</span>
                              )}
                              {viewTab === "received" && (
                                <span className="flex items-center gap-1"><Users size={11} />{getTransferSenderLabel(t)}</span>
                              )}
                              {t.hasPassword && <span className="flex items-center gap-1"><Lock size={11} className="text-orange-400" />Password</span>}
                              {isStarred && <span className="flex items-center gap-1"><Star size={11} className="fill-amber-400 text-amber-400" />Starred</span>}
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => handleCopy(t)}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-xs font-semibold text-(--text-muted) transition-colors hover:border-orange-200 hover:text-orange-500 dark:border-zinc-700">
                                {copiedId === t.id
                                  ? <><Check size={11} className="text-emerald-500" /> Copied</>
                                  : <><Copy size={11} /> Copy Link</>}
                              </button>
                              <Link href={`/transfers/${t.id}`}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400">
                                <ArrowUpRight size={11} /> Details
                              </Link>
                              <button type="button" aria-label="Delete transfer" onClick={() => handleDelete(t)}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-zinc-700">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                </div>

                {/* Footer count */}
                {!loading && filtered.length > 0 && (
                  <div className="border-t border-gray-100 px-5 py-3 dark:border-zinc-800">
                    <p className="text-xs text-(--text-muted)">
                      Showing <span className="font-semibold text-(--text)">{filtered.length}</span> of{" "}
                      <span className="font-semibold text-(--text)">{transfers.length}</span> transfers
                      {search && <> matching <span className="font-semibold text-orange-500">"{search}"</span></>}
                    </p>
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
