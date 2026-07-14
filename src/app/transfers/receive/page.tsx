"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Inbox, Download, Search, Clock, File, FileText, Video, Archive,
  Table2, Image as ImageIcon, Music, Code, RefreshCw, X, Users, Lock,
  CheckCircle, AlertCircle, Copy, Check, ExternalLink,
  Sparkles, CloudUpload, Shield, TrendingUp, Eye,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { formatBytes, formatRelative } from "@/lib/utils";
import {
  getTransferFileCount,
  getTransferLink,
  getTransferSenderEmail,
  getTransferSenderLabel,
  getTransfersFromResponse,
  getTransferTotalSize,
} from "@/lib/transfers";
import { transfersApi } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { Transfer } from "@/types";

/* ──────────────────────────────────────────
   File icon chip
────────────────────────────────────────── */
function FileChip({ name, size, extension }: { name: string; size: number; extension: string }) {
  const e = extension.toLowerCase();
  const icon =
    e === "pdf"                              ? <FileText size={11} className="text-red-500" /> :
    ["jpg","jpeg","png","gif","svg","webp"].includes(e) ? <ImageIcon size={11} className="text-blue-500" /> :
    ["mp4","mov","avi","mkv"].includes(e)    ? <Video   size={11} className="text-purple-500" /> :
    ["zip","tar","gz","rar","7z"].includes(e)? <Archive size={11} className="text-amber-500" /> :
    ["xls","xlsx","csv"].includes(e)         ? <Table2  size={11} className="text-green-500" /> :
    ["mp3","wav","ogg","flac"].includes(e)   ? <Music   size={11} className="text-pink-500" /> :
    ["js","ts","jsx","tsx","py","html","css"].includes(e) ? <Code size={11} className="text-cyan-500" /> :
    <File size={11} className="text-gray-400" />;
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-gray-200/80 bg-gray-50 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-800">
      {icon}
      <span className="max-w-28 truncate text-[11px] font-medium text-(--text)">{name}</span>
      <span className="shrink-0 text-[10px] text-(--text-muted)">{formatBytes(size)}</span>
    </div>
  );
}

/* ──────────────────────────────────────────
   Status dot for expiry
────────────────────────────────────────── */
function ExpiryBadge({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
      <Clock size={9} /> Expired
    </span>
  );
  if (daysLeft === 0) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-red-500">
      <AlertCircle size={9} /> Expires today
    </span>
  );
  if (daysLeft <= 3) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500">
      <Clock size={9} /> {daysLeft}d left
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] text-(--text-muted)">
      <Clock size={9} /> {daysLeft}d left
    </span>
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

/* ──────────────────────────────────────────
   Types
────────────────────────────────────────── */
type FilterVal = "all" | "new" | "downloaded" | "expiring";

function getDaysLeft(expiresAt: string | undefined, now: number): number | null {
  if (!expiresAt) return null;
  const time = new Date(expiresAt).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - now) / 86_400_000);
}

function isRecentlyReceived(t: Transfer, now: number): boolean {
  const created = new Date(t.createdAt).getTime();
  return !Number.isNaN(created) && now - created < 86_400_000 * 2;
}

/* ══════════════════════════════════════════
   PAGE
══════════════════════════════════════════ */
export default function ReceivedFilesPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter,    setFilter]    = useState<FilterVal>("all");
  const [search,    setSearch]    = useState("");
  const [copiedId,  setCopiedId]  = useState<string | null>(null);

  const [now, setNow] = useState(() => Date.now());

  /* ── Fetch received transfers ── */
  const loadTransfers = useCallback(async (showSuccess = false) => {
    try {
      setLoading(true);
      setError(null);
      setNow(Date.now());
      const res = await transfersApi.received({ limit: 100 });
      setTransfers(getTransfersFromResponse(res.data));
      if (showSuccess) showToast.success("Received items refreshed");
    } catch {
      setTransfers([]);
      setError("Failed to load received items. Please try again.");
      showToast.error("Failed to load received items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadTransfers());
  }, [loadTransfers]);

  /* ── Derived per-transfer helpers ── */
  function daysLeft(expiresAt?: string): number | null {
    return getDaysLeft(expiresAt, now);
  }

  function isNew(t: Transfer): boolean {
    return isRecentlyReceived(t, now);
  }

  function isExpiring(t: Transfer): boolean {
    const d = daysLeft(t.expiresAt);
    return d !== null && d >= 0 && d <= 3;
  }

  function getLink(t: Transfer): string {
    return getTransferLink(t);
  }

  /* ── Stats (derived before render) ── */
  const stats = useMemo(() => {
    const totalSize = transfers.reduce((sum, t) => sum + getTransferTotalSize(t), 0);
    return {
      totalCount: transfers.length,
      newCount: transfers.filter((t) => isRecentlyReceived(t, now)).length,
      downloadedCount: transfers.filter((t) => (t.downloads ?? 0) > 0).length,
      expiringCount: transfers.filter((t) => {
        const d = getDaysLeft(t.expiresAt, now);
        return d !== null && d >= 0 && d <= 3;
      }).length,
      totalSize,
    };
  }, [transfers, now]);

  /* ── Filter + search ── */
  const filtered = useMemo(() => {
    let list = transfers;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) =>
        (t.title ?? "").toLowerCase().includes(q) ||
        (t.sender?.email ?? "").toLowerCase().includes(q) ||
        (t.sender?.name ?? "").toLowerCase().includes(q) ||
        (t.files ?? []).some((f) => f.name.toLowerCase().includes(q))
      );
    }
    if (filter === "new")        list = list.filter(isNew);
    if (filter === "downloaded") list = list.filter((t) => (t.downloads ?? 0) > 0);
    if (filter === "expiring")   list = list.filter(isExpiring);
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers, filter, search, now]);

  const FILTER_TABS: { value: FilterVal; label: string; count: number }[] = [
    { value: "all",        label: "All",           count: stats.totalCount },
    { value: "new",        label: "New",           count: stats.newCount },
    { value: "downloaded", label: "Downloaded",    count: stats.downloadedCount },
    { value: "expiring",   label: "Expiring Soon", count: stats.expiringCount },
  ];

  const handleCopy = (t: Transfer) => {
    const url = getLink(t);
    navigator.clipboard?.writeText(url).catch(() => showToast.error("Unable to copy link"));
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast.success("Link copied");
  };

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-5 pb-14">

          {/* ── Hero ── */}
          <div className="relative overflow-hidden rounded-2xl border border-blue-200/50 bg-linear-to-br from-blue-50 via-sky-50/40 to-white px-6 py-6 dark:border-blue-900/20 dark:from-blue-950/25 dark:via-sky-900/10 dark:to-zinc-900/0">
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-blue-400/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-8 left-16 h-32 w-32 rounded-full bg-sky-400/8 blur-2xl" />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500 to-sky-500 text-white shadow-xl shadow-blue-500/25">
                  <Inbox size={22} />
                  {stats.newCount > 0 && (
                    <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white shadow-sm">
                      {stats.newCount > 99 ? "99+" : stats.newCount}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-extrabold tracking-tight text-(--text)">Received Items</h1>
                    {stats.newCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                        <Sparkles size={9} /> {stats.newCount} New
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-(--text-muted)">Files and transfers sent to you by others</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px] text-(--text-muted)"><CloudUpload size={10} className="text-sky-500" /> Cloudflare R2</span>
                    <span className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                    <span className="flex items-center gap-1 text-[11px] text-(--text-muted)"><Shield size={10} className="text-emerald-500" /> Encrypted</span>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => loadTransfers(true)}
                disabled={loading}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white/80 px-3.5 py-2 text-xs font-semibold text-(--text-muted) shadow-sm backdrop-blur-sm transition-colors hover:text-(--text) disabled:opacity-50 dark:border-zinc-700/60 dark:bg-zinc-900/80">
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total Received" value={stats.totalCount} loading={loading} gradient="from-blue-500 to-sky-500" icon={<Inbox size={15} />} />
            <StatCard label="New" value={stats.newCount} loading={loading} gradient="from-orange-500 to-amber-500" icon={<Sparkles size={15} />} />
            <StatCard label="Downloaded" value={stats.downloadedCount} loading={loading} gradient="from-emerald-500 to-green-600" icon={<Download size={15} />} />
            <StatCard label="Expiring Soon" value={stats.expiringCount} loading={loading} gradient="from-red-500 to-rose-500" icon={<AlertCircle size={15} />} />
          </div>

          {!loading && stats.totalCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-700 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-300">
              <span className="font-semibold">{stats.totalCount.toLocaleString()} received item{stats.totalCount !== 1 ? "s" : ""}</span>
              <span className="text-blue-300 dark:text-blue-700">/</span>
              <span>{formatBytes(stats.totalSize)} available</span>
              {stats.expiringCount > 0 && (
                <>
                  <span className="text-blue-300 dark:text-blue-700">/</span>
                  <span className="font-semibold text-amber-700 dark:text-amber-300">{stats.expiringCount} expiring soon</span>
                </>
              )}
            </div>
          )}

          {/* ── Filters + search ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-0.5 rounded-xl border border-gray-200/60 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
              {FILTER_TABS.map((tab) => (
                <button key={tab.value} type="button" onClick={() => setFilter(tab.value)}
                  className={[
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    filter === tab.value
                      ? "bg-gray-100 text-(--text) dark:bg-zinc-800"
                      : "text-(--text-muted) hover:text-(--text)",
                  ].join(" ")}>
                  {tab.label}
                  <span className={`text-[10px] font-bold ${filter === tab.value ? "text-blue-500" : "text-(--text-muted)"}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search by title, sender or file…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-8 pr-8 text-sm text-(--text) outline-none transition-all placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-900 sm:w-68"
              />
              {search && (
                <button type="button" aria-label="Clear search" onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-800" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-red-200/80 bg-red-50/70 px-6 py-18 text-center shadow-sm dark:border-red-900/40 dark:bg-red-950/20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-red-500 dark:bg-zinc-900">
                <AlertCircle size={22} />
              </div>
              <div>
                <p className="font-semibold text-(--text)">Received items could not be loaded</p>
                <p className="mt-0.5 text-sm text-(--text-muted)">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => loadTransfers()}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-red-700"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200/80 bg-white py-20 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 dark:bg-zinc-800">
                {search
                  ? <Search size={22} className="text-gray-300 dark:text-zinc-600" />
                  : <Inbox size={22} className="text-gray-300 dark:text-zinc-600" />}
              </div>
              <div>
                <p className="font-semibold text-(--text)">
                  {search ? "No matches found" : filter !== "all" ? `No ${filter} transfers` : "Nothing received yet"}
                </p>
                <p className="mt-0.5 text-sm text-(--text-muted)">
                  {search ? "Try a different search term" : "Transfers sent to you will appear here"}
                </p>
              </div>
              {(search || filter !== "all") && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setFilter("all"); }}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-4 text-xs font-semibold text-(--text-muted) transition-colors hover:text-(--text) dark:border-zinc-700"
                >
                  <X size={12} /> Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((t) => {
                const days     = daysLeft(t.expiresAt);
                const expiring = isExpiring(t);
                const brandNew = isNew(t);
                const hasDl    = (t.downloads ?? 0) > 0;
                const link     = getLink(t);
                const senderName  = getTransferSenderLabel(t);
                const senderEmail = getTransferSenderEmail(t);
                const fileCount = getTransferFileCount(t);
                const totalSize = getTransferTotalSize(t);
                const indicator = brandNew && !hasDl ? "new" : expiring ? "expiring" : null;

                return (
                  <div key={t.id}
                    className={[
                      "group overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:shadow-md dark:bg-zinc-900",
                      brandNew && !hasDl
                        ? "border-blue-200/70 dark:border-blue-800/40"
                        : expiring
                          ? "border-amber-200/70 dark:border-amber-800/40"
                          : "border-gray-200/80 dark:border-zinc-800",
                    ].join(" ")}>

                    {/* New / expiring indicator strip */}
                    {indicator && (
                      <div className={[
                        "h-0.5 w-full bg-linear-to-r",
                        indicator === "new" ? "from-blue-400 to-sky-400" : "from-amber-400 to-orange-400",
                      ].join(" ")}
                      />
                    )}

                    <div className="p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        {/* Icon */}
                        <div className={[
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                          brandNew && !hasDl
                            ? "bg-blue-50 text-blue-500 dark:bg-blue-900/20"
                            : "bg-gray-50 text-gray-500 dark:bg-zinc-800",
                        ].join(" ")}>
                          <Inbox size={20} />
                        </div>

                        <div className="min-w-0 flex-1 space-y-3">
                          {/* Title row */}
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="break-words font-bold text-(--text)">
                                  {t.title || `Transfer ${t.id.slice(-8)}`}
                                </h3>
                                {brandNew && !hasDl && (
                                  <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                    New
                                  </span>
                                )}
                                {t.hasPassword && (
                                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-500">
                                    <Lock size={9} /> Protected
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-(--text-muted)">
                                <Users size={11} className="text-gray-400" />
                                From{" "}
                                <span className="font-semibold text-(--text)">{senderName}</span>
                                {senderEmail && senderName !== senderEmail && (
                                  <span className="text-xs text-(--text-muted)">({senderEmail})</span>
                                )}
                              </p>
                            </div>
                            <span className="shrink-0 text-[11px] text-(--text-muted)">
                              {formatRelative(t.createdAt)}
                            </span>
                          </div>

                          {/* Message */}
                          {t.message && (
                            <p className="line-clamp-2 text-sm text-(--text-muted)">{t.message}</p>
                          )}

                          {/* File chips */}
                          {t.files?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {t.files.slice(0, 4).map((f, i) => (
                                <FileChip key={i} name={f.name} size={f.size} extension={f.extension} />
                              ))}
                              {t.files.length > 4 && (
                                <div className="flex items-center rounded-lg border border-gray-200/80 bg-gray-50 px-2.5 py-1.5 text-[10px] font-medium text-(--text-muted) dark:border-zinc-700 dark:bg-zinc-800">
                                  +{t.files.length - 4} more
                                </div>
                              )}
                            </div>
                          )}

                          {/* Footer row */}
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-(--text-muted)">
                              <span>{fileCount} file{fileCount !== 1 ? "s" : ""} · {formatBytes(totalSize)}</span>
                              <ExpiryBadge daysLeft={days} />
                              {hasDl && (
                                <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle size={9} /> Downloaded
                                </span>
                              )}
                              {(t.views ?? 0) > 0 && (
                                <span className="flex items-center gap-1">
                                  <Eye size={9} /> {t.views} view{t.views !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Copy link */}
                              <button type="button" onClick={() => handleCopy(t)}
                                title="Copy share link"
                                className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600 dark:border-zinc-700">
                                {copiedId === t.id
                                  ? <Check size={13} className="text-emerald-500" />
                                  : <Copy size={13} />}
                              </button>

                              {/* View details */}
                              <Link href={`/transfers/${t.id}`}
                                className="flex h-8 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-(--text-muted) transition-colors hover:border-gray-300 hover:text-(--text) dark:border-zinc-700">
                                <ExternalLink size={12} /> Details
                              </Link>

                              {/* Download / Open */}
                              <a href={link} target="_blank" rel="noopener noreferrer"
                                className="flex h-8 items-center gap-1.5 rounded-xl bg-blue-500 px-3 text-xs font-bold text-white shadow-sm shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-md">
                                <Download size={12} /> Download
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer count */}
          {!loading && filtered.length > 0 && (
            <p className="text-center text-xs text-(--text-muted)">
              Showing <span className="font-semibold text-(--text)">{filtered.length}</span> of{" "}
              <span className="font-semibold text-(--text)">{stats.totalCount}</span> received transfers
            </p>
          )}

        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
