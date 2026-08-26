"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Files,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import AuthGuard from "@/components/auth/AuthGuard";
import DashboardLayout from "@/components/layout/DashboardLayout";
import FloatingActionMenu from "@/components/ui/FloatingActionMenu";
import Card from "@/components/ui/Card";
import { FileTypeIcon } from "@/components/ui/FileTypeIcon";
import { Avatar, EmptyState, Modal, Spinner } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { adminApi, filesApi } from "@/lib/api";
import { getErrorMessage, handleApiError } from "@/lib/error-handler";
import { showToast } from "@/lib/toast";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/utils";

interface AdminFileOwner {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
}

interface AdminFileFolder {
  id?: string;
  name?: string;
  path?: string;
}

interface AdminFile {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  extension: string;
  status: string;
  isTrashed: boolean;
  owner?: AdminFileOwner;
  folder?: AdminFileFolder;
  description?: string;
  tags: string[];
  downloadCount: number;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  lastAccessedAt?: string;
}

interface FileSummary {
  active: number;
  total: number;
  trashed: number;
  images: number;
  videos: number;
  documents: number;
  totalSize: number;
}

const EMPTY_SUMMARY: FileSummary = {
  active: 0,
  total: 0,
  trashed: 0,
  images: 0,
  videos: 0,
  documents: 0,
  totalSize: 0,
};

const PAGE_SIZE = 20;
const TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "application/pdf", label: "PDF" },
  { value: "text", label: "Text" },
] as const;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return asString(record.id) ?? asString(record._id);
}

function unwrapApiData(value: unknown): UnknownRecord {
  const root = asRecord(value);
  return Object.keys(asRecord(root.data)).length > 0 ? asRecord(root.data) : root;
}

function extensionFromName(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? (parts.pop() ?? "").toLowerCase() : "";
}

function mapFile(value: unknown): AdminFile | null {
  const raw = asRecord(value);
  const id = readId(raw.id) ?? readId(raw._id);
  if (!id) return null;

  const originalName =
    asString(raw.originalName) ??
    asString(raw.fileName) ??
    asString(raw.name) ??
    "Untitled";
  const ownerRaw = asRecord(raw.uploadedBy ?? raw.owner);
  const folderRaw = asRecord(raw.folderId ?? raw.folder);
  const isTrashed = Boolean(raw.isDeleted ?? raw.isTrashed);
  const status = asString(raw.status) ?? (isTrashed ? "trashed" : "active");
  const ownerId = readId(raw.uploadedBy) ?? readId(raw.ownerId) ?? readId(raw.owner);
  const folderId = readId(raw.folderId) ?? readId(raw.folder);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    id,
    name: asString(raw.fileName) ?? asString(raw.name) ?? originalName,
    originalName,
    size: asNumber(raw.size ?? raw.fileSize),
    mimeType: asString(raw.mimeType) ?? "application/octet-stream",
    extension:
      asString(raw.extension)?.toLowerCase() ?? extensionFromName(originalName),
    status,
    isTrashed,
    owner: ownerId
      ? {
          id: ownerId,
          name: asString(ownerRaw.name),
          email: asString(ownerRaw.email),
          role: asString(ownerRaw.role),
          department: asString(ownerRaw.department),
        }
      : undefined,
    folder: folderId
      ? {
          id: folderId,
          name: asString(folderRaw.name),
          path: asString(folderRaw.path),
        }
      : undefined,
    description: asString(raw.description),
    tags,
    downloadCount: asNumber(raw.downloadCount),
    createdAt: asString(raw.createdAt) ?? new Date(0).toISOString(),
    updatedAt: asString(raw.updatedAt),
    deletedAt: asString(raw.deletedAt),
    lastAccessedAt: asString(raw.lastAccessedAt),
  };
}

function parseFileResponse(value: unknown) {
  const data = unwrapApiData(value);
  const rawFiles = Array.isArray(data.files)
    ? data.files
    : Array.isArray(data.items)
      ? data.items
      : [];
  const pagination = asRecord(data.pagination ?? data.meta);
  const files = rawFiles
    .map(mapFile)
    .filter((file): file is AdminFile => file !== null);

  return {
    files,
    total: asNumber(pagination.total ?? data.total ?? data.count),
    pages: asNumber(pagination.pages ?? data.pages),
  };
}

function parseSummary(storageValue: unknown, allFilesValue: unknown): FileSummary {
  const storage = unwrapApiData(storageValue);
  const storageSummary = asRecord(storage.summary);
  const categories = Array.isArray(storage.byCategory) ? storage.byCategory : [];
  const categoryCounts = new Map(
    categories.map((item) => {
      const record = asRecord(item);
      return [asString(record.category ?? record._id) ?? "other", asNumber(record.count)];
    }),
  );
  const active = asNumber(storageSummary.totalFiles);
  const allFiles = parseFileResponse(allFilesValue).total;

  return {
    active,
    total: Math.max(active, allFiles),
    trashed: Math.max(0, allFiles - active),
    images: categoryCounts.get("images") ?? 0,
    videos: categoryCounts.get("videos") ?? 0,
    documents:
      (categoryCounts.get("documents") ?? 0) +
      (categoryCounts.get("pdfs") ?? 0) +
      (categoryCounts.get("spreadsheets") ?? 0),
    totalSize: asNumber(storageSummary.totalSizeBytes),
  };
}

function statusClass(file: AdminFile): string {
  if (file.isTrashed) {
    return "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400";
  }
  const classes: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400",
    processing: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    deleted: "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400",
  };
  return classes[file.status] ?? classes.active;
}

function getActionUrl(value: unknown, key: "viewUrl" | "downloadUrl"): string | undefined {
  const root = asRecord(value);
  const data = asRecord(root.data);
  return asString(data[key]) ?? asString(root[key]);
}

function triggerUrl(url: string, fileName?: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener noreferrer";
  if (fileName) anchor.download = fileName;
  else anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function FileActions({
  file,
  open,
  busy,
  canManage,
  onToggle,
  onClose,
  onDetails,
  onPreview,
  onDownload,
  onTrash,
  onRestore,
  onPermanentDelete,
}: {
  file: AdminFile;
  open: boolean;
  busy: boolean;
  canManage: boolean;
  onToggle: () => void;
  onClose: () => void;
  onDetails: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:text-gray-300 dark:hover:bg-zinc-800";

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={`Actions for ${file.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        disabled={busy}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50 dark:hover:bg-orange-950/20"
      >
        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>

      <FloatingActionMenu open={open} anchorRef={anchorRef} onClose={onClose} width={190}>
        <button type="button" role="menuitem" className={itemClass} onClick={onDetails}>
          <Eye className="h-4 w-4 text-blue-500" />
          View details
        </button>
        <button type="button" role="menuitem" className={itemClass} onClick={onPreview} disabled={file.isTrashed || !canManage}>
          <Eye className="h-4 w-4 text-purple-500" />
          Preview file
        </button>
        <button type="button" role="menuitem" className={itemClass} onClick={onDownload} disabled={file.isTrashed || !canManage}>
          <Download className="h-4 w-4 text-green-500" />
          Download
        </button>

        <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />

        {file.isTrashed ? (
          <>
            <button type="button" role="menuitem" className={itemClass} onClick={onRestore} disabled={!canManage}>
              <RotateCcw className="h-4 w-4 text-orange-500" />
              Restore
            </button>
            <button type="button" role="menuitem" className={`${itemClass} text-red-600 dark:text-red-400`} onClick={onPermanentDelete} disabled={!canManage}>
              <X className="h-4 w-4" />
              Delete permanently
            </button>
          </>
        ) : (
          <button type="button" role="menuitem" className={`${itemClass} text-red-600 dark:text-red-400`} onClick={onTrash} disabled={!canManage}>
            <Trash2 className="h-4 w-4" />
            Move to trash
          </button>
        )}
      </FloatingActionMenu>
    </>
  );
}

export default function AdminFilesPage() {
  const { user: me } = useAuth();
  const router = useRouter();
  const role = me?.role?.toLowerCase();
  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperadmin = role === "superadmin";

  const [files, setFiles] = useState<AdminFile[]>([]);
  const [total, setTotal] = useState(0);
  const [serverPages, setServerPages] = useState(0);
  const [summary, setSummary] = useState<FileSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showTrashed, setShowTrashed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<AdminFile | null>(null);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (me && !isAdmin) router.replace("/dashboard");
  }, [me, isAdmin, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadFiles = useCallback(async () => {
    if (!isAdmin) return;
    const requestId = ++requestIdRef.current;
    if (hasLoadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await adminApi.files({
        page,
        limit: PAGE_SIZE,
        includeTrashed: showTrashed,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(typeFilter !== "all" ? { mimeType: typeFilter } : {}),
      });
      if (requestId !== requestIdRef.current) return;

      const parsed = parseFileResponse(response.data);
      if (parsed.pages > 0 && page > parsed.pages) {
        setPage(parsed.pages);
        return;
      }
      setFiles(parsed.files);
      setTotal(parsed.total);
      setServerPages(parsed.pages);
      hasLoadedRef.current = true;
    } catch (reason) {
      if (requestId !== requestIdRef.current) return;
      setFiles([]);
      setTotal(0);
      setServerPages(0);
      setError(getErrorMessage(reason));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [debouncedSearch, isAdmin, page, showTrashed, typeFilter]);

  const loadSummary = useCallback(async () => {
    if (!isAdmin) return;
    setSummaryLoading(true);
    try {
      const [storageResponse, allFilesResponse] = await Promise.all([
        adminApi.storage(),
        adminApi.files({ page: 1, limit: 1, includeTrashed: true }),
      ]);
      setSummary(parseSummary(storageResponse.data, allFilesResponse.data));
    } catch (reason) {
      handleApiError(reason, true);
    } finally {
      setSummaryLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadFiles(), 0);
    return () => window.clearTimeout(timer);
  }, [loadFiles, refreshKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSummary(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSummary, refreshKey]);

  const totalPages = Math.max(1, serverPages || Math.ceil(total / PAGE_SIZE));

  const stats = useMemo(
    () => [
      {
        label: "Active files",
        value: summary.active.toLocaleString(),
        helper: `${summary.total.toLocaleString()} including trash`,
        icon: Files,
        tone: "bg-blue-50 text-blue-600 ring-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:ring-blue-800/40",
      },
      {
        label: "Storage used",
        value: formatBytes(summary.totalSize),
        helper: "Active file storage",
        icon: HardDrive,
        tone: "bg-orange-50 text-orange-600 ring-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:ring-orange-800/40",
      },
      {
        label: "Images & videos",
        value: (summary.images + summary.videos).toLocaleString(),
        helper: `${summary.documents.toLocaleString()} documents`,
        icon: ImageIcon,
        tone: "bg-purple-50 text-purple-600 ring-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:ring-purple-800/40",
      },
      {
        label: "In trash",
        value: summary.trashed.toLocaleString(),
        helper: "Excluded from storage usage",
        icon: Trash2,
        tone: "bg-red-50 text-red-600 ring-red-200 dark:bg-red-950/20 dark:text-red-400 dark:ring-red-800/40",
      },
    ],
    [summary],
  );

  const canManage = useCallback(
    (file: AdminFile) =>
      isSuperadmin ||
      !file.owner?.id ||
      file.owner.id === me?.id ||
      file.owner.id === (me as { _id?: string } | null)?._id,
    [isSuperadmin, me],
  );

  const refresh = useCallback(() => {
    setOpenMenuId(null);
    setRefreshKey((key) => key + 1);
  }, []);

  const runFileAction = useCallback(
    async (file: AdminFile, action: "preview" | "download" | "trash" | "restore" | "permanent") => {
      setOpenMenuId(null);
      setBusyFileId(file.id);
      try {
        if (action === "preview") {
          const response = await filesApi.getViewUrl(file.id);
          const url = getActionUrl(response.data, "viewUrl");
          if (!url) throw new Error("No preview URL returned");
          triggerUrl(url);
          return;
        }

        if (action === "download") {
          const response = await filesApi.download(file.id);
          const url = getActionUrl(response.data, "downloadUrl");
          if (!url) throw new Error("No download URL returned");
          triggerUrl(url, file.originalName);
          showToast.success("Download started");
          return;
        }

        if (action === "trash") {
          if (!window.confirm(`Move “${file.name}” to trash?`)) return;
          await filesApi.delete(file.id);
          showToast.success("File moved to trash");
        } else if (action === "restore") {
          await filesApi.restore(file.id);
          showToast.success("File restored");
        } else {
          if (!window.confirm(`Permanently delete “${file.name}”? This action cannot be undone.`)) return;
          await filesApi.permanentDelete(file.id);
          showToast.success("File permanently deleted");
        }

        if (selectedFile?.id === file.id) setSelectedFile(null);
        refresh();
      } catch (reason) {
        handleApiError(reason);
      } finally {
        setBusyFileId(null);
      }
    },
    [refresh, selectedFile],
  );

  const changeTypeFilter = (value: string) => {
    setTypeFilter(value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setTypeFilter("all");
    setShowTrashed(false);
    setPage(1);
  };

  const hasFilters = Boolean(search || typeFilter !== "all" || showTrashed);
  const scopeLabel = isSuperadmin
    ? "Platform-wide file management"
    : "Files uploaded within your admin scope";

  const renderActions = (file: AdminFile, placement: "mobile" | "desktop") => {
    const menuKey = `${file.id}:${placement}`;
    return (
    <FileActions
      file={file}
      open={openMenuId === menuKey}
      busy={busyFileId === file.id}
      canManage={canManage(file)}
      onToggle={() => setOpenMenuId((id) => (id === menuKey ? null : menuKey))}
      onClose={() => setOpenMenuId(null)}
      onDetails={() => {
        setOpenMenuId(null);
        setSelectedFile(file);
      }}
      onPreview={() => void runFileAction(file, "preview")}
      onDownload={() => void runFileAction(file, "download")}
      onTrash={() => void runFileAction(file, "trash")}
      onRestore={() => void runFileAction(file, "restore")}
      onPermanentDelete={() => void runFileAction(file, "permanent")}
    />
    );
  };

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-6 pb-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/20 dark:ring-blue-800/30">
                <Files className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Files manager</h1>
                <p className="text-xs text-gray-400 dark:text-gray-500">{scopeLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={loading || refreshing}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400 dark:hover:border-orange-700 dark:hover:text-orange-400"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading || refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{stat.label}</p>
                      {summaryLoading ? (
                        <div className="mt-2 h-7 w-20 animate-pulse rounded-lg bg-gray-100 dark:bg-zinc-800" />
                      ) : (
                        <p className="mt-1 truncate text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                      )}
                    </div>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${stat.tone}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-2 truncate text-[11px] text-gray-400">{stat.helper}</p>
                </div>
              );
            })}
          </div>

          <Card className="p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="relative min-w-0 flex-1">
                <label htmlFor="admin-file-search" className="sr-only">Search files</label>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="admin-file-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by file name…"
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-10 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
                {search && (
                  <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="admin-file-type" className="sr-only">Filter by file type</label>
                <select
                  id="admin-file-type"
                  value={typeFilter}
                  onChange={(event) => changeTypeFilter(event.target.value)}
                  className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300"
                >
                  {TYPE_FILTERS.map((filter) => (
                    <option key={filter.value} value={filter.value}>{filter.label}</option>
                  ))}
                </select>

                <button
                  type="button"
                  aria-pressed={showTrashed}
                  onClick={() => {
                    setShowTrashed((value) => !value);
                    setPage(1);
                  }}
                  className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${
                    showTrashed
                      ? "border-red-300 bg-red-50 text-red-600 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-400"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {showTrashed ? "Trash included" : "Include trash"}
                </button>

                {hasFilters && (
                  <button type="button" onClick={clearFilters} className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-zinc-800 dark:hover:text-gray-200">
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </button>
                )}
              </div>
            </div>
          </Card>

          <div className="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {refreshing && (
              <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-orange-100 dark:bg-orange-950/30">
                <div className="h-full w-1/2 animate-pulse bg-orange-500" />
              </div>
            )}

            {loading ? (
              <div className="flex h-56 flex-col items-center justify-center gap-3">
                <Spinner size={24} />
                <p className="text-xs text-gray-400">Loading files…</p>
              </div>
            ) : error ? (
              <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-950/20">
                  <AlertCircle className="h-5 w-5" />
                </span>
                <h2 className="mt-3 text-sm font-bold text-gray-900 dark:text-white">Could not load files</h2>
                <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">{error}</p>
                <button type="button" onClick={refresh} className="mt-4 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-600">
                  Try again
                </button>
              </div>
            ) : files.length === 0 ? (
              <div className="py-5">
                <EmptyState
                  icon={<Files size={32} />}
                  title={hasFilters ? "No matching files" : "No files found"}
                  description={hasFilters ? "Try changing or clearing the current filters" : "Uploaded files will appear here"}
                  action={
                    hasFilters ? (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-600"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <>
                <div className="grid gap-3 p-3 md:hidden">
                  {files.map((file) => (
                    <article key={file.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-600 dark:bg-zinc-800 dark:text-gray-300">
                          <FileTypeIcon mime={file.mimeType} ext={file.extension} size={21} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white" title={file.name}>{file.name}</p>
                          <p className="mt-0.5 truncate text-[11px] text-gray-400">{file.owner?.name ?? file.owner?.email ?? "Unknown owner"}</p>
                        </div>
                        {renderActions(file, "mobile")}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-[11px] text-gray-500 dark:border-zinc-800 dark:text-gray-400">
                        <span>{formatBytes(file.size)}</span>
                        <span aria-hidden="true">•</span>
                        <span>{file.extension ? file.extension.toUpperCase() : "FILE"}</span>
                        <span aria-hidden="true">•</span>
                        <span>{formatRelative(file.createdAt)}</span>
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusClass(file)}`}>
                          {file.isTrashed ? "trashed" : file.status}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/70 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <tr>
                        {["File", "Owner", "Folder", "Size", "Status", "Uploaded", "Actions"].map((heading) => (
                          <th key={heading} className={`px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 ${heading === "Actions" ? "text-right" : ""}`}>
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                      {files.map((file) => (
                        <tr key={file.id} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-zinc-800/30">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-600 dark:bg-zinc-800 dark:text-gray-300">
                                <FileTypeIcon mime={file.mimeType} ext={file.extension} size={18} />
                              </span>
                              <div className="min-w-0">
                                <p className="max-w-56 truncate text-xs font-semibold text-gray-800 dark:text-gray-200" title={file.name}>{file.name}</p>
                                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400">{file.extension || file.mimeType.split("/")[1] || "file"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            {file.owner ? (
                              <div className="flex items-center gap-2">
                                <Avatar name={file.owner.name ?? file.owner.email ?? "?"} size={26} />
                                <div className="min-w-0">
                                  <p className="max-w-40 truncate text-xs font-medium text-gray-700 dark:text-gray-300">{file.owner.name ?? "Unknown"}</p>
                                  <p className="max-w-40 truncate text-[10px] text-gray-400">{file.owner.email ?? file.owner.role ?? "—"}</p>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex max-w-36 items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                              <span className="truncate" title={file.folder?.path ?? file.folder?.name}>{file.folder?.name ?? "Root"}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-xs text-gray-600 dark:text-gray-400">{formatBytes(file.size)}</td>
                          <td className="px-5 py-3.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusClass(file)}`}>
                              {file.isTrashed ? "trashed" : file.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5">
                            <p className="text-xs text-gray-500">{formatRelative(file.createdAt)}</p>
                            <p className="text-[10px] text-gray-400">{formatDateTime(file.createdAt)}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex justify-end">{renderActions(file, "desktop")}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-zinc-800">
                  <p className="text-xs text-gray-500">
                    Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} files
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button type="button" aria-label="Previous page" disabled={page === 1 || refreshing} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="min-w-20 text-center text-xs font-medium text-gray-600 dark:text-gray-400">{page} / {totalPages}</span>
                      <button type="button" aria-label="Next page" disabled={page >= totalPages || refreshing} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <Modal open={selectedFile !== null} onClose={() => setSelectedFile(null)} title="File details" width={620}>
          {selectedFile && (
            <div className="max-h-[72vh] overflow-y-auto p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:ring-orange-800/40">
                  <FileTypeIcon mime={selectedFile.mimeType} ext={selectedFile.extension} size={27} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-base font-bold text-gray-900 dark:text-white">{selectedFile.name}</h2>
                  <p className="mt-1 break-all font-mono text-[10px] text-gray-400">{selectedFile.id}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusClass(selectedFile)}`}>
                    {selectedFile.isTrashed ? "trashed" : selectedFile.status}
                  </span>
                </div>
              </div>

              <dl className="mt-6 grid gap-4 rounded-2xl border border-gray-100 bg-gray-50/70 p-4 text-xs sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-800/30">
                {[
                  ["Original name", selectedFile.originalName],
                  ["Size", formatBytes(selectedFile.size)],
                  ["MIME type", selectedFile.mimeType],
                  ["File type", selectedFile.extension?.toUpperCase() || "Unknown"],
                  ["Owner", selectedFile.owner?.name ?? "Unknown"],
                  ["Owner email", selectedFile.owner?.email ?? "—"],
                  ["Folder", selectedFile.folder?.path ?? selectedFile.folder?.name ?? "Root"],
                  ["Downloads", selectedFile.downloadCount.toLocaleString()],
                  ["Uploaded", formatDateTime(selectedFile.createdAt)],
                  ["Last accessed", selectedFile.lastAccessedAt ? formatDateTime(selectedFile.lastAccessedAt) : "Never"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="font-semibold text-gray-400">{label}</dt>
                    <dd className="mt-1 break-words font-medium text-gray-700 dark:text-gray-300">{value}</dd>
                  </div>
                ))}
              </dl>

              {selectedFile.description && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-400">Description</p>
                  <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{selectedFile.description}</p>
                </div>
              )}

              {selectedFile.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {selectedFile.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-600 dark:bg-zinc-800 dark:text-gray-300">#{tag}</span>
                  ))}
                </div>
              )}

              <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-zinc-800">
                <button type="button" onClick={() => setSelectedFile(null)} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800">
                  Close
                </button>
                {!selectedFile.isTrashed && canManage(selectedFile) && (
                  <>
                    <button type="button" onClick={() => void runFileAction(selectedFile, "preview")} disabled={busyFileId === selectedFile.id} className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 disabled:opacity-50">
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </button>
                    <button type="button" onClick={() => void runFileAction(selectedFile, "download")} disabled={busyFileId === selectedFile.id} className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50">
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </Modal>
      </DashboardLayout>
    </AuthGuard>
  );
}
