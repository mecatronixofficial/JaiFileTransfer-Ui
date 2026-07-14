"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import {
  Activity,
  Download,
  MoreHorizontal,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { transactionsApi } from "@/lib/api";
import { handleApiError } from "@/lib/error-handler";
import { Transaction } from "@/types";
import { Avatar, Badge, EmptyState, SearchInput, Spinner } from "@/components/ui";
import Button from "@/components/ui/Button";
import { formatBytes, formatRelative, truncate } from "@/lib/utils";
import { FileTypeIcon } from "@/components/ui/FileTypeIcon";

type FilterType = "all" | "upload" | "download" | "share" | "delete";

const FILTERS: FilterType[] = ["all", "upload", "download", "share", "delete"];

const TX_ICONS: Record<string, React.ReactNode> = {
  upload:   <Upload   size={15} className="text-emerald-500" />,
  download: <Download size={15} className="text-blue-500"    />,
  share:    <Share2   size={15} className="text-orange-500"  />,
  delete:   <Trash2   size={15} className="text-red-500"     />,
};

const TX_BADGES: Record<string, "success" | "info" | "warning" | "danger"> = {
  upload:   "success",
  download: "info",
  share:    "warning",
  delete:   "danger",
};

const TX_ICON_BG: Record<string, string> = {
  upload:   "bg-emerald-500/10 border-emerald-500/20",
  download: "bg-blue-500/10    border-blue-500/20",
  share:    "bg-orange-500/10  border-orange-500/20",
  delete:   "bg-red-500/10     border-red-500/20",
};

/** Maps a raw backend action string to a simplified UI category. */
function getActionCategory(action?: string): FilterType {
  if (!action) return "all";
  const a = action.toLowerCase();
  if (a.includes("upload") || a === "upload_file" || a === "folder_upload_init" ||
      a === "init_multipart_upload" || a === "complete_multipart_upload") return "upload";
  if (a.includes("download")) return "download";
  if (a.includes("share") || a === "create_share" || a === "update_share" ||
      a === "revoke_share" || a === "delete_share" || a === "share_email_sent" ||
      a === "send_transfer" || a === "view_transfer" || a === "download_transfer") return "share";
  if (a.includes("delete") || a === "permanent_delete" || a === "restore") return "delete";
  return "all";
}

/** Human-readable label for a raw action string. */
function formatAction(action?: string): string {
  if (!action) return "—";
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STAT_CARDS = [
  { key: "upload"   as FilterType, label: "Uploads",   icon: <Upload   size={18} className="text-emerald-500" />, color: "text-emerald-600 dark:text-emerald-400" },
  { key: "download" as FilterType, label: "Downloads", icon: <Download size={18} className="text-blue-500"    />, color: "text-blue-600    dark:text-blue-400"    },
  { key: "share"    as FilterType, label: "Shared",    icon: <Share2   size={18} className="text-orange-500"  />, color: "text-orange-600 dark:text-orange-400"   },
  { key: "delete"   as FilterType, label: "Deleted",   icon: <Trash2   size={18} className="text-red-500"     />, color: "text-red-600    dark:text-red-400"      },
] as const;

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [filter, setFilter]             = useState<FilterType>("all");
  const [search, setSearch]             = useState("");

  useEffect(() => {
    loadTransactions();
  }, []);

  async function loadTransactions(silent = false) {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const res   = await transactionsApi.list({ limit: 100 });
      const inner = res.data?.data ?? res.data;
      const list  =
        inner?.transactions ??
        inner?.activities ??
        inner?.items ??
        inner?.results ??
        inner?.data ??
        (Array.isArray(inner) ? inner : []);
      setTransactions(Array.isArray(list) ? list : []);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: transactions.length };
    for (const tx of transactions) {
      const cat = getActionCategory(tx.action ?? tx.type);
      c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    let list = filter === "all"
      ? transactions
      : transactions.filter((tx) => getActionCategory(tx.action ?? tx.type) === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (tx) =>
          tx.file?.name?.toLowerCase().includes(q) ||
          tx.user?.name?.toLowerCase().includes(q) ||
          (tx.action ?? tx.type ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [transactions, filter, search]);

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Activity Log</h1>
              <p className="mt-1 text-sm text-(--text-muted)">
                Track uploads, downloads, shares, and deleted files
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />}
              onClick={() => loadTransactions(true)}
              disabled={refreshing || loading}
            >
              Refresh
            </Button>
          </div>

          {/* ── Stat cards ── */}
          {!loading && transactions.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STAT_CARDS.map(({ key, label, icon, color }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(filter === key ? "all" : key)}
                  className={`group flex items-center gap-3 rounded-2xl border bg-(--bg-card) px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                    filter === key
                      ? "border-orange-400/60 ring-2 ring-orange-500/15 dark:border-orange-500/50"
                      : "border-(--border) hover:border-orange-300/60 dark:hover:border-orange-500/30"
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${TX_ICON_BG[key]}`}>
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-(--text-muted)">{label}</p>
                    <p className={`text-xl font-extrabold ${color}`}>{counts[key] ?? 0}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Filters + Search ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 rounded-2xl border border-(--border) bg-(--bg-3) p-1">
              {FILTERS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={filter === item ? "primary" : "ghost"}
                  onClick={() => setFilter(item)}
                  className="capitalize"
                  glow={false}
                >
                  {item}
                  {counts[item] !== undefined && (
                    <span
                      className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                        filter === item ? "bg-white/25 text-white" : "bg-(--bg-2) text-(--text-muted)"
                      }`}
                    >
                      {counts[item]}
                    </span>
                  )}
                </Button>
              ))}
            </div>

            <div className="w-full sm:w-64">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search by file or user…"
              />
            </div>
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div className="flex min-h-75 items-center justify-center">
              <Spinner size={28} />
            </div>
          ) : filteredTransactions.length === 0 ? (
            <EmptyState
              icon={<Activity size={34} />}
              title={search ? "No results found" : "No activity yet"}
              description={
                search
                  ? `No transactions match "${search}"`
                  : "Uploads, downloads, shares, and deletions will appear here."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-3xl border border-(--border) bg-(--bg-card)">
              {/* row count strip */}
              <div className="border-b border-(--border) bg-(--bg-2) px-5 py-3">
                <p className="text-xs font-semibold text-(--text-muted)">
                  Showing{" "}
                  <span className="font-bold text-(--text-primary)">
                    {filteredTransactions.length}
                  </span>{" "}
                  {filteredTransactions.length === 1 ? "transaction" : "transactions"}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-190">
                  <thead className="border-b border-(--border) bg-(--bg-2)">
                    <tr>
                      {["Action", "File", "User", "Size", "Time", "Status"].map((head) => (
                        <th
                          key={head}
                          className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-(--text-muted)"
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-(--border)">
                    {filteredTransactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="transition-colors duration-150 hover:bg-(--bg-2)"
                      >
                        {/* Action */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {(() => {
                              const cat = getActionCategory(tx.action ?? tx.type);
                              return (
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${TX_ICON_BG[cat] ?? "border-(--border) bg-(--bg-3)"}`}>
                                  {TX_ICONS[cat] ?? <MoreHorizontal size={15} className="text-gray-400" />}
                                </div>
                              );
                            })()}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">{formatAction(tx.action ?? tx.type)}</p>
                              {tx.ip && <p className="text-[11px] text-(--text-muted) font-mono">{tx.ip}</p>}
                            </div>
                          </div>
                        </td>

                        {/* File */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {tx.file && (
                              <FileTypeIcon
                                mime={tx.file.mimeType}
                                ext={tx.file.extension || ""}
                                size={22}
                              />
                            )}
                            <div className="min-w-0">
                              <p
                                className="truncate text-sm font-medium"
                                title={tx.file?.name}
                              >
                                {truncate(tx.file?.name || "Unknown File", 38)}
                              </p>
                              {tx.file?.mimeType && (
                                <p className="mt-0.5 text-xs text-(--text-muted)">
                                  {tx.file.mimeType}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* User */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            {tx.user?.name && <Avatar name={tx.user.name} size={28} />}
                            <span className="text-sm text-(--text-muted)">
                              {tx.user?.name || tx.userId || "Unknown"}
                            </span>
                          </div>
                        </td>

                        {/* Size */}
                        <td className="px-5 py-4 text-sm tabular-nums text-(--text-muted)">
                          {tx.file?.size ? formatBytes(tx.file.size) : "—"}
                        </td>

                        {/* Time */}
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-(--text-muted)">
                          {formatRelative(tx.createdAt)}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          {(() => {
                            const cat = getActionCategory(tx.action ?? tx.type);
                            return (
                              <Badge variant={TX_BADGES[cat] ?? "default"} className="capitalize">
                                {cat}
                              </Badge>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
