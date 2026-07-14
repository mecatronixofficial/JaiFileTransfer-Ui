"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  Database,
  ExternalLink,
  Files,
  LayoutGrid,
  List,
  MoreHorizontal,
  RefreshCw,
  Route,
  Search,
  Send,
  SortAsc,
  SortDesc,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { Spinner } from "@/components/ui";
import { transfersApi } from "@/lib/api";
import { Transfer } from "@/types";
import { cn, formatBytes, formatDateTime, formatRelative, truncate } from "@/lib/utils";
import {
  getTransferFileCount,
  getTransferSenderEmail,
  getTransferSenderLabel,
  getTransfersFromResponse,
  getTransferTotalSize,
} from "@/lib/transfers";
import { handleApiError } from "@/lib/error-handler";
import { showToast } from "@/lib/toast";
import Button from "@/components/ui/Button";

type ViewMode = "grid" | "list";
type SortField = "name" | "size" | "createdAt";
type SortDir = "asc" | "desc";

function firstRecipient(t: Transfer) {
  if (t.isReceived) return getTransferSenderEmail(t) ?? getTransferSenderLabel(t);
  return t.recipients?.[0] ?? "No recipient";
}

function statusClass(status?: string) {
  if (status === "active") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (status === "expired") return "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400";
  if (status === "disabled") return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
  return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500";
}

export default function StarredPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const res = await transfersApi.starred();
      setTransfers(getTransfersFromResponse(res.data));
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

  useEffect(() => {
    if (!menuOpen) return;
    const fn = () => setMenuOpen(null);
    document.addEventListener("click", fn);
    return () => document.removeEventListener("click", fn);
  }, [menuOpen]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const items = search
      ? transfers.filter((t) =>
          t.title.toLowerCase().includes(q) ||
          firstRecipient(t).toLowerCase().includes(q) ||
          (t.status ?? "").toLowerCase().includes(q),
        )
      : transfers;

    return [...items].sort((a, b) => {
      let diff = 0;
      if (sortField === "name") diff = a.title.localeCompare(b.title);
      else if (sortField === "size") diff = getTransferTotalSize(a) - getTransferTotalSize(b);
      else diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "asc" ? diff : -diff;
    });
  }, [transfers, search, sortField, sortDir]);

  const totalSize = useMemo(() => transfers.reduce((sum, t) => sum + getTransferTotalSize(t), 0), [transfers]);
  const totalFiles = useMemo(() => transfers.reduce((sum, t) => sum + getTransferFileCount(t), 0), [transfers]);
  const activeCount = useMemo(() => transfers.filter((t) => t.status === "active").length, [transfers]);
  const recipientCount = useMemo(() => new Set(transfers.flatMap((t) => t.recipients ?? [])).size, [transfers]);
  const latestUpdatedAt = useMemo(() => {
    const dates = transfers
      .map((t) => t.updatedAt ?? t.createdAt)
      .filter(Boolean)
      .map((date) => new Date(date).getTime())
      .filter(Number.isFinite);
    return dates.length ? new Date(Math.max(...dates)).toISOString() : undefined;
  }, [transfers]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  async function handleUnstar(transfer: Transfer) {
    setRemoving(transfer.id);
    setTransfers((prev) => prev.filter((t) => t.id !== transfer.id));
    try {
      await transfersApi.unstar(transfer.id);
      showToast.success(`"${transfer.title}" removed from starred`);
    } catch (err) {
      setTransfers((prev) => [...prev, transfer]);
      handleApiError(err);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-5 pb-10">
          <div className="relative overflow-hidden rounded-2xl border border-orange-200/50 bg-linear-to-br from-orange-50 via-amber-50/30 to-white px-6 py-5 dark:border-orange-900/20 dark:from-orange-950/20 dark:via-amber-900/10 dark:to-zinc-900/0">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-400/6 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-yellow-400 to-orange-500 text-white shadow-lg shadow-orange-500/20">
                  <Star size={22} className="fill-white" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-(--text)">Starred Transfers</h1>
                  <p className="mt-0.5 text-sm text-(--text-muted)">
                    {loading ? "Loading..." : `${transfers.length} transfer${transfers.length !== 1 ? "s" : ""} starred for quick access`}
                  </p>
                  {!loading && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-(--text-muted)">
                      <span className="inline-flex items-center gap-1 rounded-full border border-orange-200/60 bg-white/70 px-2 py-0.5 text-orange-600 dark:border-orange-900/30 dark:bg-zinc-900/50 dark:text-orange-400">
                        <Route size={10} />
                        Starred workspace
                      </span>
                      {latestUpdatedAt && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200/70 bg-white/70 px-2 py-0.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                          <Clock3 size={10} />
                          Updated {formatRelative(latestUpdatedAt)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />}
                  onClick={() => load(true)}
                  disabled={refreshing || loading}
                >
                  Refresh
                </Button>
                <Link
                  href="/transfers"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
                >
                  <Send size={14} />
                  Transfers
                </Link>
              </div>
            </div>
          </div>

          {!loading && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                { label: "Starred", value: transfers.length.toLocaleString(), sub: `${activeCount} active`, icon: <Star size={14} />, color: "text-yellow-500" },
                { label: "Files", value: totalFiles.toLocaleString(), sub: "Across starred transfers", icon: <Files size={14} />, color: "text-blue-500" },
                { label: "Recipients", value: recipientCount.toLocaleString(), sub: "Unique recipients", icon: <Users size={14} />, color: "text-green-500" },
                { label: "Storage", value: totalSize > 0 ? formatBytes(totalSize) : "0 B", sub: "Starred transfer size", icon: <Database size={14} />, color: "text-purple-500" },
                { label: "Last Change", value: latestUpdatedAt ? formatRelative(latestUpdatedAt) : "-", sub: latestUpdatedAt ? formatDateTime(latestUpdatedAt) : "No activity", icon: <CalendarDays size={14} />, color: "text-red-500" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-gray-200/70 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${stat.color}`}>
                    {stat.icon}
                    {stat.label}
                  </div>
                  <p className="text-lg font-bold tabular-nums text-(--text)">{stat.value}</p>
                  <p className="mt-0.5 truncate text-[11px] text-(--text-muted)">{stat.sub}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-72">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search starred transfers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-8 pr-7 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              />
              {search && (
                <button type="button" aria-label="Clear search" onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-0.5 rounded-xl border border-gray-200/80 bg-white px-2 py-1 sm:flex dark:border-zinc-700 dark:bg-zinc-900">
                {(["name", "size", "createdAt"] as SortField[]).map((field) => (
                  <button key={field} type="button" onClick={() => handleSort(field)}
                    className={cn(
                      "flex items-center gap-0.5 rounded-lg px-2.5 py-1 text-xs font-medium transition",
                      sortField === field
                        ? "bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400"
                        : "text-(--text-muted) hover:text-(--text)",
                    )}>
                    {field === "createdAt" ? "Date" : field === "name" ? "Name" : "Size"}
                    {sortField === field && (sortDir === "asc" ? <SortAsc size={10} /> : <SortDesc size={10} />)}
                  </button>
                ))}
              </div>
              <div className="flex overflow-hidden rounded-xl border border-gray-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                {(["grid", "list"] as ViewMode[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => setView(mode)} aria-label={`${mode} view`}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center transition-all",
                      view === mode
                        ? "bg-orange-500 text-white"
                        : "text-(--text-muted) hover:bg-gray-50 hover:text-orange-500 dark:hover:bg-zinc-800",
                    )}>
                    {mode === "grid" ? <LayoutGrid size={15} /> : <List size={15} />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center"><Spinner size={28} /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200/80 bg-white py-24 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-50 dark:bg-zinc-800">
                <Star size={32} className="text-gray-300 dark:text-zinc-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-(--text)">
                  {search ? "No starred transfers found" : "No starred transfers"}
                </p>
                <p className="mt-0.5 text-sm text-(--text-muted)">
                  {search ? `Nothing matches "${search}"` : "Star transfers from any view to find them quickly here."}
                </p>
              </div>
              {!search && (
                <Link href="/transfers" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
                  Browse Transfers
                </Link>
              )}
            </div>
          ) : (
            <section>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <p className="text-xs font-bold uppercase tracking-widest text-(--text-muted)">
                  Starred Transfers · {filtered.length}
                </p>
                {totalSize > 0 && <span className="text-[11px] text-(--text-muted)">{formatBytes(totalSize)}</span>}
              </div>

              {view === "grid" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((transfer) => (
                    <StarredTransferCard
                      key={transfer.id}
                      transfer={transfer}
                      removing={removing === transfer.id}
                      onUnstar={() => handleUnstar(transfer)}
                    />
                  ))}
                </div>
              ) : (
                <StarredTransferTable
                  transfers={filtered}
                  menuOpen={menuOpen}
                  removing={removing}
                  setMenuOpen={setMenuOpen}
                  onUnstar={handleUnstar}
                />
              )}
            </section>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}

function StarredTransferCard({
  transfer,
  removing,
  onUnstar,
}: {
  transfer: Transfer;
  removing: boolean;
  onUnstar: () => void;
}) {
  const files = getTransferFileCount(transfer);
  const totalSize = getTransferTotalSize(transfer);
  const directionLabel = transfer.isReceived ? "Received" : "Sent";

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300/70 hover:shadow-xl hover:shadow-orange-500/5 dark:border-zinc-700/60 dark:bg-zinc-900">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-500 dark:bg-orange-900/20">
            <Send size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-(--text)" title={transfer.title}>
              {truncate(transfer.title, 36)}
            </p>
            <p className="truncate text-xs text-(--text-muted)">{firstRecipient(transfer)}</p>
          </div>
        </div>
        <button
          type="button"
          title="Remove from starred"
          disabled={removing}
          onClick={onUnstar}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-yellow-400 transition-colors hover:bg-yellow-50 hover:text-yellow-500 disabled:opacity-40 dark:hover:bg-yellow-900/20"
        >
          <Star size={16} className="fill-yellow-400" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted) dark:bg-zinc-800">
          {files} file{files !== 1 ? "s" : ""}
        </span>
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted) dark:bg-zinc-800">
          {formatBytes(totalSize)}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusClass(transfer.status)}`}>
          {transfer.status ?? "pending"}
        </span>
      </div>

      <div className="mt-4 space-y-1 text-[11px] text-(--text-muted)">
        <p className="flex items-center gap-1">
          <CalendarDays size={10} />
          {directionLabel} {formatRelative(transfer.createdAt)}
        </p>
        <p className="flex items-center gap-1">
          <Clock3 size={10} />
          Updated {formatRelative(transfer.updatedAt ?? transfer.createdAt)}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Link
          href={`/transfers/${transfer.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 transition hover:border-orange-300 hover:text-orange-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300"
        >
          <ExternalLink size={12} />
          View Transfer
        </Link>
        <button
          type="button"
          onClick={onUnstar}
          disabled={removing}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-red-500 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-red-950/30"
        >
          <Trash2 size={12} />
          Remove
        </button>
      </div>
    </div>
  );
}

function StarredTransferTable({
  transfers,
  menuOpen,
  removing,
  setMenuOpen,
  onUnstar,
}: {
  transfers: Transfer[];
  menuOpen: string | null;
  removing: string | null;
  setMenuOpen: (id: string | null) => void;
  onUnstar: (transfer: Transfer) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-zinc-800 dark:bg-zinc-800/30">
            <tr>
              {["Transfer", "Files", "Size", "Shared", "Status", "Actions"].map((label) => (
                <th key={label} className={cn(
                  "px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-(--text-muted)",
                  label === "Actions" && "text-center",
                )}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
            {transfers.map((transfer) => {
              const files = getTransferFileCount(transfer);
              const totalSize = getTransferTotalSize(transfer);
              return (
                <tr key={transfer.id} className="transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-500 dark:bg-orange-900/20">
                        <Send size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="max-w-56 truncate text-xs font-semibold text-(--text)" title={transfer.title}>
                          {truncate(transfer.title, 42)}
                        </p>
                        <p className="truncate text-[11px] text-(--text-muted)">{firstRecipient(transfer)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-(--text-muted)">
                    {files} file{files !== 1 ? "s" : ""}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-(--text-muted)">{formatBytes(totalSize)}</td>
                  <td className="px-5 py-3.5 text-xs text-(--text-muted)">{formatRelative(transfer.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusClass(transfer.status)}`}>
                      {transfer.status ?? "pending"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        href={`/transfers/${transfer.id}`}
                        title="View transfer"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-500 dark:hover:bg-zinc-800"
                      >
                        <ExternalLink size={14} />
                      </Link>
                      <button
                        type="button"
                        title="Remove from starred"
                        disabled={removing === transfer.id}
                        onClick={() => onUnstar(transfer)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-yellow-400 transition-colors hover:bg-yellow-50 hover:text-yellow-500 disabled:opacity-40 dark:hover:bg-yellow-900/20"
                      >
                        <Star size={15} className="fill-yellow-400" />
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          title="More options"
                          aria-label="More options"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuOpen(menuOpen === transfer.id ? null : transfer.id);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {menuOpen === transfer.id && (
                          <div
                            className="absolute right-0 top-9 z-20 min-w-40 rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Link
                              href={`/transfers/${transfer.id}`}
                              onClick={() => setMenuOpen(null)}
                              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800"
                            >
                              <ExternalLink size={13} /> View Transfer
                            </Link>
                            <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />
                            <button
                              type="button"
                              onClick={() => { onUnstar(transfer); setMenuOpen(null); }}
                              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              <X size={13} /> Remove from starred
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
    </div>
  );
}
