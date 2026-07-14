"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarDays,
  Clock3,
  Database,
  Download,
  HardDrive,
  LayoutGrid,
  List,
  RefreshCw,
  Route,
  Search,
  Share2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { FileCard } from "@/components/files/FileCard";
import { FileTypeIcon } from "@/components/ui/FileTypeIcon";
import { EmptyState, Spinner } from "@/components/ui";
import { filesApi } from "@/lib/api";
import { handleApiError } from "@/lib/error-handler";
import { showToast } from "@/lib/toast";
import { cn, formatBytes, formatDateTime, formatRelative, truncate } from "@/lib/utils";
import type { FileItem, User } from "@/types";

type SortKey = "name" | "size" | "owner" | "date";
type SortDir = "asc" | "desc";
type ViewMode = "grid" | "list";

type SharedFileItem = FileItem & {
  uploadedBy?: Partial<User>;
  sharedBy?: Partial<User>;
  shareInfo?: {
    sharedBy?: Partial<User>;
    permission?: string;
    sharedAt?: string;
  };
};

function displayName(file: FileItem) {
  return file.originalName || file.name || "Untitled file";
}

function senderId(file: SharedFileItem) {
  return (
    file.shareInfo?.sharedBy?.id ||
    file.sharedBy?.id ||
    file.owner?.id ||
    file.uploadedBy?.id ||
    file.ownerId ||
    "unknown"
  );
}

function senderLabel(file: SharedFileItem) {
  return (
    file.shareInfo?.sharedBy?.name ||
    file.sharedBy?.name ||
    file.owner?.name ||
    file.uploadedBy?.name ||
    file.shareInfo?.sharedBy?.email ||
    file.sharedBy?.email ||
    file.owner?.email ||
    file.uploadedBy?.email ||
    "Unknown sender"
  );
}

function senderEmail(file: SharedFileItem) {
  return (
    file.shareInfo?.sharedBy?.email ||
    file.sharedBy?.email ||
    file.owner?.email ||
    file.uploadedBy?.email ||
    ""
  );
}

function sharedAt(file: SharedFileItem) {
  return file.shareInfo?.sharedAt || file.updatedAt || file.createdAt;
}

function fileKind(file: FileItem) {
  const mime = (file.mimeType || "").toLowerCase();
  const ext = (file.extension || file.originalName?.split(".").pop() || file.name?.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.includes("pdf") || ext === "pdf") return "PDF";
  if (mime.includes("spreadsheet") || ["xls", "xlsx", "csv", "ods"].includes(ext)) return "Sheet";
  if (mime.includes("word") || mime.includes("document") || ["doc", "docx", "txt", "rtf", "pages", "odt"].includes(ext)) return "Document";
  return ext ? ext.toUpperCase() : "File";
}

async function downloadFile(file: FileItem) {
  try {
    const res = await filesApi.download(file.id);
    const url: string = res.data?.data?.downloadUrl ?? res.data?.downloadUrl ?? res.data?.url;
    if (!url) throw new Error("No download URL returned");

    const a = document.createElement("a");
    a.href = url;
    a.download = file.originalName || file.name;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast.success("Download started");
  } catch (err) {
    handleApiError(err);
  }
}

export default function SharedPage() {
  const [files, setFiles] = useState<SharedFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<ViewMode>("grid");

  const loadSharedFiles = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const res = await filesApi.sharedWithMe();
      const data = res.data?.files || res.data?.data?.files || res.data?.data || res.data || [];
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadSharedFiles());
  }, [loadSharedFiles]);

  const senders = useMemo(() => {
    return Array.from(
      new Map(
        files.map((file) => [
          senderId(file),
          {
            id: senderId(file),
            name: senderLabel(file),
            email: senderEmail(file),
          },
        ]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [files]);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + (file.size ?? 0), 0), [files]);
  const latestSharedAt = useMemo(() => {
    const latest = files
      .map((file) => new Date(sharedAt(file)).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    return latest ? new Date(latest) : null;
  }, [files]);
  const typeCount = useMemo(() => new Set(files.map(fileKind)).size, [files]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = files.filter((file) => {
      const matchesSender = ownerFilter === "all" || senderId(file) === ownerFilter;
      const matchesSearch =
        !q ||
        displayName(file).toLowerCase().includes(q) ||
        senderLabel(file).toLowerCase().includes(q) ||
        senderEmail(file).toLowerCase().includes(q) ||
        fileKind(file).toLowerCase().includes(q);
      return matchesSender && matchesSearch;
    });

    return [...list].sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = displayName(a).localeCompare(displayName(b));
      else if (sortKey === "size") diff = (a.size ?? 0) - (b.size ?? 0);
      else if (sortKey === "owner") diff = senderLabel(a).localeCompare(senderLabel(b));
      else diff = new Date(sharedAt(a)).getTime() - new Date(sharedAt(b)).getTime();
      return sortDir === "asc" ? diff : -diff;
    });
  }, [files, ownerFilter, search, sortDir, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  }

  function clearFilters() {
    setSearch("");
    setOwnerFilter("all");
  }

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-6">
          <section className="overflow-hidden rounded-[28px] border border-orange-200/70 bg-linear-to-br from-orange-50 via-white to-amber-50 shadow-sm dark:border-orange-900/40 dark:from-orange-950/40 dark:via-zinc-950 dark:to-stone-950">
            <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                  <Share2 size={24} />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-extrabold tracking-tight text-(--text-primary)">Shared with Me</h1>
                  <p className="mt-1 max-w-2xl text-sm text-(--text-muted)">
                    Files other users shared with you, grouped by sender and ready for quick review.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white/80 px-3 py-1 text-xs font-semibold text-orange-700 dark:border-orange-900/60 dark:bg-zinc-950/70 dark:text-orange-300">
                      <Users size={12} />
                      {senders.length} sender{senders.length === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-white/70 px-3 py-1 text-xs font-medium text-(--text-secondary) dark:bg-zinc-950/60">
                      <Clock3 size={12} />
                      {latestSharedAt ? `Last shared ${formatRelative(latestSharedAt)}` : "Waiting for shares"}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => loadSharedFiles(true)}
                disabled={refreshing}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-4 text-sm font-semibold text-orange-700 shadow-sm transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-orange-900/60 dark:bg-zinc-950 dark:text-orange-300 dark:hover:bg-orange-950/30"
              >
                <RefreshCw size={15} className={cn(refreshing && "animate-spin")} />
                Refresh
              </button>
            </div>

            <div className="grid border-t border-orange-100 bg-white/65 dark:border-orange-900/30 dark:bg-zinc-950/45 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { label: "Shared Files", value: files.length.toString(), icon: Share2, color: "text-orange-500" },
                { label: "Shared By", value: senders.length.toString(), icon: Users, color: "text-blue-500" },
                { label: "Total Size", value: formatBytes(totalSize), icon: HardDrive, color: "text-emerald-500" },
                { label: "File Types", value: typeCount.toString(), icon: Database, color: "text-violet-500" },
                { label: "Latest Share", value: latestSharedAt ? formatRelative(latestSharedAt) : "--", icon: CalendarDays, color: "text-rose-500" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 border-b border-orange-100 px-5 py-4 last:border-b-0 dark:border-orange-900/25 sm:odd:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--bg-secondary)", item.color)}>
                    <item.icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-(--text-muted)">{item.label}</p>
                    <p className="truncate text-sm font-bold text-(--text-primary)">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-(--text-primary)">Shared Files</h2>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                    {displayed.length}
                  </span>
                </div>
                <p className="mt-1 text-sm text-(--text-muted)">
                  {formatBytes(displayed.reduce((sum, file) => sum + (file.size ?? 0), 0))} visible
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                  <input
                    type="text"
                    placeholder="Search files or senders"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-10 w-full rounded-xl border border-(--border) bg-(--bg-card) pl-9 pr-9 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 sm:w-64"
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-primary)"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value)}
                  className="h-10 rounded-xl border border-(--border) bg-(--bg-card) px-3 text-sm font-medium text-(--text-secondary) outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15"
                >
                  <option value="all">All senders</option>
                  {senders.map((sender) => (
                    <option key={sender.id} value={sender.id}>
                      {sender.name}
                    </option>
                  ))}
                </select>

                <div className="flex items-center rounded-xl border border-(--border) bg-(--bg-card) p-1">
                  {(["name", "size", "owner", "date"] as SortKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={cn(
                        "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold capitalize transition",
                        sortKey === key
                          ? "bg-orange-500 text-white shadow-sm"
                          : "text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text-primary)",
                      )}
                    >
                      {key}
                      {sortKey === key && (sortDir === "asc" ? <ArrowUpAZ size={12} /> : <ArrowDownAZ size={12} />)}
                    </button>
                  ))}
                </div>

                <div className="grid h-10 grid-cols-2 rounded-xl border border-(--border) bg-(--bg-card) p-1">
                  <button
                    type="button"
                    aria-label="Grid view"
                    onClick={() => setView("grid")}
                    className={cn("flex h-8 w-9 items-center justify-center rounded-lg transition", view === "grid" ? "bg-orange-500 text-white" : "text-(--text-muted) hover:bg-(--bg-hover)")}
                  >
                    <LayoutGrid size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="List view"
                    onClick={() => setView("list")}
                    className={cn("flex h-8 w-9 items-center justify-center rounded-lg transition", view === "list" ? "bg-orange-500 text-white" : "text-(--text-muted) hover:bg-(--bg-hover)")}
                  >
                    <List size={15} />
                  </button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-(--border) bg-(--bg-card)">
                <Spinner size={30} />
              </div>
            ) : files.length === 0 ? (
              <EmptyState
                icon={<Share2 size={34} />}
                title="No shared files yet"
                description="Files shared with you by other users will appear here."
              />
            ) : displayed.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-(--border) bg-(--bg-card) text-center">
                <Search size={32} className="text-(--text-muted)" />
                <p className="text-sm font-semibold text-(--text-secondary)">No shared files match your filters</p>
                <button type="button" onClick={clearFilters} className="text-sm font-semibold text-orange-500 hover:underline">
                  Clear filters
                </button>
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {displayed.map((file) => (
                  <div key={file.id} className="group relative">
                    <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white shadow-sm">
                        {senderLabel(file).slice(0, 2).toUpperCase()}
                      </div>
                      <span className="max-w-32 truncate rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-orange-700 shadow-sm dark:bg-zinc-950/95 dark:text-orange-300">
                        {senderLabel(file)}
                      </span>
                    </div>
                    <FileCard file={file} onRefresh={() => loadSharedFiles(true)} isShared />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-(--border) bg-(--bg-card)">
                <div className="hidden grid-cols-[minmax(260px,1fr)_180px_110px_120px_160px_72px] gap-4 border-b border-(--border) px-4 py-3 text-xs font-semibold uppercase tracking-wide text-(--text-muted) lg:grid">
                  <span>Name</span>
                  <span>Shared By</span>
                  <span>Size</span>
                  <span>Type</span>
                  <span>Shared</span>
                  <span className="text-right">Action</span>
                </div>
                <div className="divide-y divide-(--border)">
                  {displayed.map((file) => (
                    <div key={file.id} className="grid gap-3 px-4 py-4 transition hover:bg-(--bg-hover) lg:grid-cols-[minmax(260px,1fr)_180px_110px_120px_160px_72px] lg:items-center lg:gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--bg-secondary)">
                          <FileTypeIcon mime={file.mimeType} ext={file.extension ?? ""} size={22} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-(--text-primary)" title={displayName(file)}>
                            {truncate(displayName(file), 54)}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--text-muted)">
                            <span className="inline-flex items-center gap-1">
                              <Route size={11} />
                              Shared with me
                            </span>
                            {senderEmail(file) && <span className="truncate">{senderEmail(file)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-(--text-secondary)">
                        <UserRound size={14} className="text-orange-500" />
                        <span className="truncate">{senderLabel(file)}</span>
                      </div>
                      <span className="text-sm font-medium text-(--text-secondary)">{formatBytes(file.size)}</span>
                      <span className="w-fit rounded-full bg-(--bg-secondary) px-2.5 py-1 text-xs font-semibold text-(--text-secondary)">
                        {fileKind(file)}
                      </span>
                      <div className="text-sm text-(--text-secondary)">
                        <p>{formatRelative(sharedAt(file))}</p>
                        <p className="text-xs text-(--text-muted)">{formatDateTime(sharedAt(file))}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Download ${displayName(file)}`}
                        onClick={() => downloadFile(file)}
                        className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-(--border) text-(--text-muted) transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/30"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
