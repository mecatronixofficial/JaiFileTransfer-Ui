"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Link as LinkIcon, Search, RefreshCw, ChevronLeft, ChevronRight,
  Eye, Download, CheckCircle2, Clock, Ban, Share2, Send, Filter,
  Copy, ExternalLink,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { EmptyState, Spinner, Avatar } from "@/components/ui";
import { adminApi, linksApi } from "@/lib/api";
import { formatRelative, formatDateTime } from "@/lib/utils";
import { handleApiError } from "@/lib/error-handler";
import { showToast } from "@/lib/toast";
import { copyToClipboard } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import { getLinksFromResponse, getTransfersFromResponse } from "@/lib/transfers";
import { SharedLink, Transfer } from "@/types";

/* ─── Types ─── */
interface AdminLink {
  id: string;
  shortCode?: string;
  url?: string;
  type?: string;
  status?: string;
  permission?: string;
  privacy?: string;
  views?: number;
  downloads?: number;
  hasPassword?: boolean;
  expiresAt?: string;
  transferTitle?: string;
  user?: { id?: string; name?: string; email?: string };
  fileCount?: number;
  totalSize?: number;
  createdAt: string;
}

function linkUrl(raw: Partial<SharedLink>, type?: string) {
  if (raw.url) return raw.url;
  if (!raw.shortCode) return undefined;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/${type === "transfer" ? "t" : "l"}/${raw.shortCode}`;
}

function mapLink(raw: Partial<SharedLink> & {
  _id?: string;
  transfer?: { title?: string };
  transferTitle?: string;
}): AdminLink {
  return {
    id:            raw.id ?? raw._id ?? "",
    shortCode:     raw.shortCode,
    url:           linkUrl(raw, raw.type),
    type:          raw.type ?? "share",
    status:        raw.status ?? "active",
    permission:    raw.permission ?? "view",
    privacy:       raw.privacy ?? "public",
    views:         raw.views ?? 0,
    downloads:     raw.downloads ?? 0,
    hasPassword:   raw.hasPassword ?? false,
    expiresAt:     raw.expiresAt,
    transferTitle: raw.transferTitle ?? raw.transfer?.title,
    user:          raw.user,
    fileCount:     raw.fileCount ?? 0,
    totalSize:     raw.totalSize,
    createdAt:     raw.createdAt ?? new Date().toISOString(),
  };
}

function parseLinks(data: unknown): AdminLink[] {
  return getLinksFromResponse(data).map(mapLink).filter((l) => l.id);
}

function linksFromTransfers(data: unknown): AdminLink[] {
  return getTransfersFromResponse(data)
    .map((transfer: Transfer) => {
      if (!transfer.link) return null;
      return mapLink({
        ...transfer.link,
        id: transfer.link.id ?? transfer.linkId ?? transfer.id,
        type: "transfer",
        transferId: transfer.id,
        transferTitle: transfer.title,
        status: transfer.link.status ?? transfer.status,
        views: transfer.link.views ?? transfer.views,
        downloads: transfer.link.downloads ?? transfer.downloads,
        fileCount: transfer.link.fileCount ?? transfer.fileCount,
        totalSize: transfer.link.totalSize ?? transfer.totalSize,
        createdAt: transfer.link.createdAt ?? transfer.createdAt,
      });
    })
    .filter((link): link is AdminLink => Boolean(link?.id));
}

function dedupeLinks(lists: AdminLink[][]): AdminLink[] {
  const map = new Map<string, AdminLink>();
  lists.flat().forEach((link) => {
    const key = link.id || link.shortCode || link.url;
    if (!key) return;
    map.set(key, { ...map.get(key), ...link });
  });
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function parseTotal(data: unknown): number {
  const root = readRecord(data);
  const inner = readRecord(root.data ?? root);
  const nested = readRecord(inner.data ?? inner);
  const meta = readRecord(root.meta ?? inner.meta ?? nested.meta);
  const pagination = readRecord(root.pagination ?? inner.pagination ?? nested.pagination);

  return Number(
    nested.total ?? inner.total ?? root.total ??
    meta.total ?? pagination.total ??
    nested.count ?? inner.count ?? root.count ?? 0,
  ) || 0;
}

/* ─── Helpers ─── */
function typeIcon(type?: string) {
  if (type === "transfer") return <Send size={13} className="text-orange-500" />;
  return <Share2 size={13} className="text-purple-500" />;
}

function statusBadge(status?: string): string {
  const map: Record<string, string> = {
    active:   "bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-400",
    expired:  "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400",
    disabled: "bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400",
  };
  return map[status ?? "active"] ?? map.active;
}

const STATUS_FILTERS = ["all", "active", "expired", "disabled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];
const PAGE_SIZE = 20;

/* ════════════════════════════════════════
   PAGE
════════════════════════════════════════ */
export default function AdminLinksPage() {
  const { user: me } = useAuth();
  const router = useRouter();

  const role = me?.role?.toLowerCase();
  const isSuperAdmin = role === "superadmin";

  const [links,     setLinks]     = useState<AdminLink[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [fetchKey,  setFetchKey]  = useState(0);
  const [search,    setSearch]    = useState("");
  const [status,    setStatus]    = useState<StatusFilter>("all");
  const [typeFilter,setTypeFilter]= useState<"all" | "share" | "transfer">("all");
  const [page,      setPage]      = useState(1);

  useEffect(() => {
    if (me && !isSuperAdmin) router.replace("/links");
  }, [me, isSuperAdmin, router]);

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const adminParams: {
        page: number;
        limit: number;
        status?: "active" | "expired" | "disabled";
        type?: "share" | "transfer";
      } = { page, limit: PAGE_SIZE };
      const linkParams: {
        page: number;
        limit: number;
        status?: string;
      } = { page, limit: PAGE_SIZE };
      const transferParams: {
        page: number;
        limit: number;
        status?: "active" | "expired" | "disabled";
      } = { page, limit: PAGE_SIZE };

      if (status !== "all") {
        adminParams.status = status;
        linkParams.status = status;
        transferParams.status = status;
      }
      if (typeFilter !== "all") adminParams.type = typeFilter;

      const [adminLinksRes, allLinksRes, transfersRes] = await Promise.allSettled([
        adminApi.links(adminParams),
        linksApi.adminList(linkParams),
        typeFilter === "share"
          ? Promise.resolve({ data: [] })
          : adminApi.transfers(transferParams),
      ]);

      const adminLinks = adminLinksRes.status === "fulfilled" ? parseLinks(adminLinksRes.value.data) : [];
      const allLinks = allLinksRes.status === "fulfilled" ? parseLinks(allLinksRes.value.data) : [];
      const transferLinks = transfersRes.status === "fulfilled" ? linksFromTransfers(transfersRes.value.data) : [];
      const merged = dedupeLinks([
        typeFilter === "transfer" ? [] : allLinks,
        adminLinks,
        typeFilter === "share" ? [] : transferLinks,
      ]).filter((link) => typeFilter === "all" || link.type === typeFilter);

      setLinks(merged);
      setTotal(Math.max(
        parseTotal(adminLinksRes.status === "fulfilled" ? adminLinksRes.value.data : {}),
        parseTotal(allLinksRes.status === "fulfilled" ? allLinksRes.value.data : {}),
        merged.length,
      ));
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, page, status, typeFilter]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load, fetchKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const displayed = search
    ? links.filter((l) =>
        (l.shortCode ?? "").includes(search) ||
        (l.transferTitle ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (l.user?.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (l.user?.email ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : links;

  async function handleCopy(url?: string) {
    if (!url) return;
    const ok = await copyToClipboard(url);
    if (ok) showToast.success("Link copied");
  }

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-6 pb-10">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-950/20 ring-1 ring-purple-200 dark:ring-purple-800/30">
                <LinkIcon size={18} className="text-purple-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Links</h1>
                <p className="text-xs text-gray-400 dark:text-gray-500">All platform share and transfer links</p>
              </div>
            </div>
            <button type="button" onClick={() => setFetchKey((k) => k + 1)} disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400 dark:hover:border-orange-700 dark:hover:text-orange-400">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Links",  value: total,                                            icon: <LinkIcon size={13} />,     color: "text-purple-500" },
              { label: "Active",       value: links.filter((l) => l.status === "active").length, icon: <CheckCircle2 size={13} />, color: "text-green-500" },
              { label: "Expired",      value: links.filter((l) => l.status === "expired").length, icon: <Clock size={13} />,        color: "text-gray-500" },
              { label: "Disabled",     value: links.filter((l) => l.status === "disabled").length, icon: <Ban size={13} />,          color: "text-red-500" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${s.color}`}>{s.icon} {s.label}</div>
                {loading ? <div className="h-6 w-12 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                  : <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>}
              </div>
            ))}
          </div>

          {/* Filters */}
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                  placeholder="Search by code, title, or user…"
                  className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Filter size={12} className="text-gray-400" />
                  {STATUS_FILTERS.map((s) => (
                    <button key={s} type="button" onClick={() => {
                      setStatus(s);
                      setPage(1);
                    }}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                        status === s
                          ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/20 dark:text-orange-400"
                          : "border-gray-200 bg-white text-gray-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
                {(["all", "share", "transfer"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => {
                    setTypeFilter(t);
                    setPage(1);
                  }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                      typeFilter === t
                        ? "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/20 dark:text-purple-400"
                        : "border-gray-200 bg-white text-gray-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {loading ? (
              <div className="flex h-52 items-center justify-center"><Spinner size={24} /></div>
            ) : displayed.length === 0 ? (
              <EmptyState icon={<LinkIcon size={32} />} title="No links found" description="Try adjusting your filters" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <tr>
                        {["Link", "Creator", "Type", "Permission", "Views", "Downloads", "Status", "Created"].map((h) => (
                          <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                      {displayed.map((l) => (
                        <tr key={l.id} className="group transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                                {l.shortCode ?? l.id.slice(0, 8)}
                              </p>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {l.url && (
                                  <>
                                    <button type="button" aria-label="Copy link" onClick={() => handleCopy(l.url)}
                                      className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800">
                                      <Copy size={11} />
                                    </button>
                                    <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label="Open link"
                                      className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800">
                                      <ExternalLink size={11} />
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>
                            {l.transferTitle && (
                              <p className="text-[11px] text-gray-400 max-w-36 truncate">{l.transferTitle}</p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            {l.user ? (
                              <div className="flex items-center gap-2">
                                <Avatar name={l.user.name ?? "?"} size={24} />
                                <div>
                                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{l.user.name ?? "Unknown"}</p>
                                  <p className="text-[11px] text-gray-400">{l.user.email}</p>
                                </div>
                              </div>
                            ) : <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5 capitalize">
                              {typeIcon(l.type)}
                              <span className="text-xs text-gray-600 dark:text-gray-400">{l.type ?? "share"}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                              l.permission === "download"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400"
                                : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400"
                            }`}>
                              {l.permission ?? "view"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                              <Eye size={11} /> {l.views ?? 0}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                              <Download size={11} /> {l.downloads ?? 0}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadge(l.status)}`}>
                              {l.status ?? "active"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5">
                            <p className="text-xs text-gray-500">{formatRelative(l.createdAt)}</p>
                            <p className="text-[11px] text-gray-400">{formatDateTime(l.createdAt)}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3.5 dark:border-zinc-800">
                    <p className="text-xs text-gray-500">Page {page} of {totalPages} · {total} total</p>
                    <div className="flex items-center gap-1.5">
                      <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500 disabled:opacity-40 dark:border-zinc-700">
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{page} / {totalPages}</span>
                      <button type="button" aria-label="Next page" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500 disabled:opacity-40 dark:border-zinc-700">
                        <ChevronRight size={14} />
                      </button>
                    </div>
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
