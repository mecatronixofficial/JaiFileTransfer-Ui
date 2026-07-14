"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { foldersApi } from "@/lib/api";
import { listenAppDataChanged } from "@/lib/app-events";
import type { Folder, FileItem } from "@/types";
import { cn, formatBytes, formatRelative, formatDateTime, truncate } from "@/lib/utils";
import { Spinner } from "@/components/ui";
import { FileCard } from "@/components/files/FileCard";
import UploadModal from "@/components/modals/UploadModal";
import {
  AlertTriangle, ChevronRight, Edit3, Files, FolderOpen,
  FolderPlus, Home, RefreshCw, Trash2, Upload, Search, X,
  LayoutGrid, List, SortAsc, SortDesc,
  Folder as FolderIcon, ChevronLeft, CalendarDays, Clock3,
  Database, GitBranch, Route, ShieldCheck, UserRound,
} from "lucide-react";
import { handleApiError } from "@/lib/error-handler";
import { showToast } from "@/lib/toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

/* ─── Types ─── */
type ViewMode  = "grid" | "list";
type SortField = "name" | "size" | "createdAt";
type SortDir   = "asc" | "desc";
type FolderPerson = {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
  role?: string;
};
type FolderWithPerson = Folder & {
  createdBy?: string | FolderPerson;
  uploadedBy?: string | FolderPerson;
  owner?: FolderPerson;
  creator?: FolderPerson;
  userId?: string;
  createdById?: string;
  uploadedById?: string;
};
type OwnedFileItem = FileItem & {
  uploadedBy?: string | FolderPerson;
  owner?: FolderPerson;
  userId?: string;
  createdBy?: string | FolderPerson;
  createdById?: string;
  uploadedById?: string;
};

/* ─── Folder color palette ─── */
const FOLDER_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  orange: { bg: "bg-orange-100 dark:bg-orange-950/30", text: "text-orange-500", border: "border-orange-200 dark:border-orange-800/40", dot: "bg-orange-500" },
  blue:   { bg: "bg-blue-100 dark:bg-blue-950/30",    text: "text-blue-500",   border: "border-blue-200 dark:border-blue-800/40",   dot: "bg-blue-500" },
  green:  { bg: "bg-green-100 dark:bg-green-950/30",  text: "text-green-500", border: "border-green-200 dark:border-green-800/40", dot: "bg-green-500" },
  purple: { bg: "bg-purple-100 dark:bg-purple-950/30",text: "text-purple-500",border: "border-purple-200 dark:border-purple-800/40",dot: "bg-purple-500" },
  red:    { bg: "bg-red-100 dark:bg-red-950/30",      text: "text-red-500",   border: "border-red-200 dark:border-red-800/40",     dot: "bg-red-500" },
  yellow: { bg: "bg-yellow-100 dark:bg-yellow-950/30",text: "text-yellow-600",border: "border-yellow-200 dark:border-yellow-800/40",dot: "bg-yellow-400" },
  gray:   { bg: "bg-gray-100 dark:bg-zinc-800/60",    text: "text-gray-500",  border: "border-gray-200 dark:border-zinc-700",      dot: "bg-gray-400" },
};

const COLOR_NAMES = Object.keys(FOLDER_COLORS);

function getFolderColors(color?: string) {
  return FOLDER_COLORS[color ?? "orange"] ?? FOLDER_COLORS.orange;
}

/* ─── Normalise API shapes ─── */
type RawRecord = Record<string, unknown>;
function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function readArray(data: unknown, keys: string[]): RawRecord[] {
  if (Array.isArray(data)) return data as RawRecord[];
  if (!data || typeof data !== "object") return [];
  const record = data as RawRecord;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value as RawRecord[];
  }
  const nested = record.data;
  if (nested && typeof nested === "object") return readArray(nested, keys);
  return [];
}

function normFolders(items: RawRecord[]): Folder[] {
  return items
    .map((item) => {
      const id = readString(item.id) ?? readString(item._id) ?? "";
      const rawParent =
        item.parentId ??
        item.parentFolderId ??
        item.parent_id ??
        (item.parent && typeof item.parent === "object" ? (item.parent as RawRecord).id ?? (item.parent as RawRecord)._id : undefined);
      return {
        ...item,
        id,
        name: readString(item.name) ?? "Untitled folder",
        parentId: readString(rawParent),
        fileCount:
          readNumber(item.fileCount) ??
          readNumber(item.filesCount) ??
          (Array.isArray(item.files) ? item.files.length : undefined),
        subfolderCount:
          readNumber(item.subfolderCount) ??
          readNumber(item.folderCount) ??
          readNumber(item.childrenCount) ??
          (Array.isArray(item.children) ? item.children.length : undefined),
        totalSize: readNumber(item.totalSize) ?? readNumber(item.size),
        color: readString(item.color) ?? "orange",
        createdAt: readString(item.createdAt) ?? new Date().toISOString(),
        updatedAt: readString(item.updatedAt) ?? readString(item.createdAt) ?? new Date().toISOString(),
      } as unknown as Folder;
    })
    .filter((folder) => folder.id);
}
function normFiles(items: RawRecord[]): FileItem[] {
  return items
    .map((item) => ({
      ...item,
      id: (item.id ?? item._id ?? "") as string,
      name: readString(item.name) ?? readString(item.fileName) ?? readString(item.originalName) ?? "Untitled file",
      size: readNumber(item.size) ?? readNumber(item.fileSize) ?? 0,
      createdAt: readString(item.createdAt) ?? new Date().toISOString(),
      updatedAt: readString(item.updatedAt) ?? readString(item.createdAt) ?? new Date().toISOString(),
    }) as unknown as FileItem)
    .filter((file) => file.id);
}

function isRootFolder(folder: Folder): boolean {
  return !folder.parentId && !folder.parent;
}

function folderPerson(folder: Folder): FolderPerson | null {
  const data = folder as FolderWithPerson;
  const person = data.createdBy ?? data.uploadedBy ?? data.owner ?? data.creator;
  if (person && typeof person === "object") return person;
  return null;
}

function folderPersonLabel(folder: Folder): string {
  const person = folderPerson(folder);
  return person?.name ?? person?.email ?? "Unknown person";
}

function folderPersonEmail(folder: Folder): string {
  return folderPerson(folder)?.email ?? "";
}

function personId(person: unknown): string | undefined {
  if (typeof person === "string" && person.trim()) return person;
  if (!person || typeof person !== "object") return undefined;
  const record = person as FolderPerson;
  return readString(record.id) ?? readString(record._id);
}

function itemOwnerIds(item: Folder | FileItem): string[] {
  const data = item as FolderWithPerson & OwnedFileItem;
  return [
    readString(data.ownerId),
    readString(data.userId),
    readString(data.createdById),
    readString(data.uploadedById),
    personId(data.owner),
    personId(data.createdBy),
    personId(data.uploadedBy),
    personId(data.creator),
  ].filter((id): id is string => Boolean(id));
}

function isOwnedBy(item: Folder | FileItem, userId?: string): boolean {
  if (!userId) return false;
  return itemOwnerIds(item).includes(userId);
}

/* ════════════════════════════════════════════
   PAGE
════════════════════════════════════════════ */
export default function FoldersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [folders,          setFolders]          = useState<Folder[]>([]);
  const [currentFolder,    setCurrentFolder]    = useState<Folder | null>(null);
  const [files,            setFiles]            = useState<FileItem[]>([]);
  const [breadcrumb,       setBreadcrumb]       = useState<Folder[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const [view,             setView]             = useState<ViewMode>("grid");
  const [search,           setSearch]           = useState("");
  const [sortField,        setSortField]        = useState<SortField>("createdAt");
  const [sortDir,          setSortDir]          = useState<SortDir>("desc");
  const [showCreate,       setShowCreate]       = useState(false);
  const [showRename,       setShowRename]       = useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm]= useState(false);
  const [deleteTarget,     setDeleteTarget]     = useState<Folder | null>(null);
  const [renameTarget,     setRenameTarget]     = useState<Folder | null>(null);
  const [folderName,       setFolderName]       = useState("");
  const [folderDescription,setFolderDescription]= useState("");
  const [folderColor,      setFolderColor]      = useState("orange");
  const [submitting,       setSubmitting]       = useState(false);
  const [showUpload,       setShowUpload]       = useState(false);
  const [tick,             setTick]             = useState(0);
  const isSuperadmin = user?.role === "superadmin";
  const currentUserId = user?.id ?? (user as { _id?: string } | null)?._id;

  const visibleFolders = useCallback(
    (items: Folder[]) => isSuperadmin ? items : items.filter((item) => isOwnedBy(item, currentUserId)),
    [currentUserId, isSuperadmin],
  );

  const visibleFiles = useCallback(
    (items: FileItem[]) => isSuperadmin ? items : items.filter((item) => isOwnedBy(item, currentUserId)),
    [currentUserId, isSuperadmin],
  );

  /* ── Trigger reload ── */
  const doRefresh = useCallback((silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    return listenAppDataChanged((detail) => {
      if (detail.files || detail.folders || detail.storage) doRefresh(true);
    });
  }, [doRefresh]);

  /* ── Load ── */
  useEffect(() => {
    if (authLoading) return;

    let mounted = true;
    const doLoad = async () => {
      try {
        if (currentFolder) {
          const res = await foldersApi.getContents(currentFolder.id);
          if (!mounted) return;
          const data = res.data?.data ?? res.data;
          setFolders(visibleFolders(normFolders(readArray(data, ["subfolders", "folders", "children"]))));
          setFiles(visibleFiles(normFiles(readArray(data, ["files", "items"]))));
        } else {
          const res = await foldersApi.list();
          if (!mounted) return;
          const all = normFolders(readArray(res.data, ["folders", "items"]));
          setFolders(visibleFolders(all.filter(isRootFolder)));
          setFiles([]);
        }
      } catch (err) {
        if (mounted) handleApiError(err);
      } finally {
        if (mounted) { setLoading(false); setRefreshing(false); }
      }
    };
    doLoad();
    return () => { mounted = false; };
  }, [authLoading, currentFolder, tick, visibleFiles, visibleFolders]);
  /* ── Navigation ── */
  function navigateTo(folder: Folder | null) {
    setSearch("");
    if (!folder) {
      setCurrentFolder(null);
      setBreadcrumb([]);
    } else {
      setCurrentFolder(folder);
      setBreadcrumb((prev) => {
        const idx = prev.findIndex((f) => f.id === folder.id);
        return idx >= 0 ? prev.slice(0, idx + 1) : [...prev, folder];
      });
    }
  }

  /* ── Sort ── */
  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  /* ── Filtered + sorted ── */
  const filteredFolders = useMemo(() => {
    const q = search.toLowerCase();
    const items = search
      ? folders.filter((f) =>
          f.name.toLowerCase().includes(q) ||
          folderPersonLabel(f).toLowerCase().includes(q) ||
          folderPersonEmail(f).toLowerCase().includes(q),
        )
      : folders;
    return [...items].sort((a, b) => {
      let diff = 0;
      if (sortField === "name")      diff = a.name.localeCompare(b.name);
      else if (sortField === "size") diff = (a.totalSize ?? 0) - (b.totalSize ?? 0);
      else                           diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "asc" ? diff : -diff;
    });
  }, [folders, search, sortField, sortDir]);

  const filteredFiles = useMemo(() => {
    const q = search.toLowerCase();
    const items = search
      ? files.filter((f) =>
          (f.name ?? "").toLowerCase().includes(q) ||
          (f.originalName ?? "").toLowerCase().includes(q) ||
          (f.mimeType ?? "").toLowerCase().includes(q),
        )
      : files;
    return [...items].sort((a, b) => {
      let diff = 0;
      if (sortField === "name")      diff = (a.name ?? "").localeCompare(b.name ?? "");
      else if (sortField === "size") diff = (a.size ?? 0) - (b.size ?? 0);
      else                           diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "asc" ? diff : -diff;
    });
  }, [files, search, sortField, sortDir]);

  /* ── Stats ── */
  const totalFolderSize = useMemo(() => folders.reduce((s, f) => s + (f.totalSize ?? 0), 0), [folders]);
  const totalFilesSize  = useMemo(() => files.reduce((s, f) => s + (f.size ?? 0), 0), [files]);
  const totalSize = totalFolderSize + totalFilesSize;
  const directFileCount = files.length;
  const nestedFolderCount = folders.reduce((s, f) => s + (f.subfolderCount ?? 0), 0);
  const folderFileCount = folders.reduce((s, f) => s + (f.fileCount ?? 0), 0);
  const latestUpdatedAt = useMemo(() => {
    const dates = [...folders, ...files]
      .map((item) => item.updatedAt ?? item.createdAt)
      .filter(Boolean)
      .map((date) => new Date(date).getTime())
      .filter(Number.isFinite);
    return dates.length ? new Date(Math.max(...dates)).toISOString() : undefined;
  }, [folders, files]);
  const activeFolderCount = useMemo(
    () => folders.filter((f) => !f.status || f.status === "active").length,
    [folders],
  );
  const isEmpty = filteredFolders.length === 0 && filteredFiles.length === 0;

  /* ── CRUD ── */
  async function createFolder(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!folderName.trim()) return;
    setSubmitting(true);
    try {
      await foldersApi.create({
        name: folderName.trim(),
        parentId: currentFolder?.id,
        color: folderColor,
        description: folderDescription.trim() || undefined,
      });
      showToast.success("Folder created");
      setShowCreate(false);
      setFolderName("");
      setFolderDescription("");
      setFolderColor("orange");
      doRefresh(true);
    } catch (err) { handleApiError(err); }
    finally { setSubmitting(false); }
  }

  async function renameFolder(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!renameTarget || !folderName.trim()) return;
    setSubmitting(true);
    try {
      await foldersApi.update(renameTarget.id, {
        name: folderName.trim(),
        color: folderColor,
        description: folderDescription.trim() || undefined,
      });
      showToast.success("Folder updated");
      setShowRename(false);
      setRenameTarget(null);
      setFolderName("");
      setFolderDescription("");
      doRefresh(true);
    } catch (err) { handleApiError(err); }
    finally { setSubmitting(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await foldersApi.delete(deleteTarget.id);
      showToast.success("Folder deleted");
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      doRefresh(true);
    } catch (err) { handleApiError(err); }
    finally { setSubmitting(false); }
  }

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-5 pb-10">

          {/* ── Hero header ── */}
          <div className="relative overflow-hidden rounded-2xl border border-orange-200/50 bg-linear-to-br from-orange-50 via-amber-50/30 to-white px-6 py-5 dark:border-orange-900/20 dark:from-orange-950/20 dark:via-amber-900/10 dark:to-zinc-900/0">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-400/6 blur-3xl" />
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20">
                    <FolderOpen size={22} />
                  </div>
                  <div>
                    <h1 className="text-xl font-extrabold tracking-tight text-(--text)">
                      {currentFolder ? currentFolder.name : "Folders"}
                    </h1>
                    <p className="mt-0.5 text-sm text-(--text-muted)">
                      {loading ? "Loading…"
                        : currentFolder
                        ? `${files.length} file${files.length !== 1 ? "s" : ""} · ${folders.length} subfolder${folders.length !== 1 ? "s" : ""}${totalFilesSize > 0 ? ` · ${formatBytes(totalFilesSize)}` : ""}`
                        : `${folders.length} folder${folders.length !== 1 ? "s" : ""}${totalSize > 0 ? ` · ${formatBytes(totalSize)} total` : ""}`}
                    </p>
                    {!loading && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-(--text-muted)">
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-200/60 bg-white/70 px-2 py-0.5 text-orange-600 dark:border-orange-900/30 dark:bg-zinc-900/50 dark:text-orange-400">
                          <Route size={10} />
                          {currentFolder?.path ?? (breadcrumb.length ? breadcrumb.map((b) => b.name).join(" / ") : "Root")}
                        </span>
                        {latestUpdatedAt && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200/70 bg-white/70 px-2 py-0.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <Clock3 size={10} />
                            Updated {formatRelative(latestUpdatedAt)}
                          </span>
                        )}
                        {currentFolder && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200/70 bg-white/70 px-2 py-0.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <UserRound size={10} />
                            Uploaded by {folderPersonLabel(currentFolder)}
                          </span>
                        )}
                        {currentFolder?.description && (
                          <span className="max-w-md truncate">{currentFolder.description}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm"
                    leftIcon={<RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />}
                    onClick={() => doRefresh(true)} disabled={refreshing || loading}>
                    Refresh
                  </Button>
                  <Button variant="secondary" size="sm" leftIcon={<Upload size={14} />}
                    onClick={() => setShowUpload(true)}>
                    Upload Here
                  </Button>
                  <Button leftIcon={<FolderPlus size={14} />}
                    onClick={() => { setFolderName(""); setFolderDescription(""); setFolderColor("orange"); setShowCreate(true); }}>
                    New Folder
                  </Button>
                </div>
              </div>

              {/* ── Breadcrumb ── */}
              <nav aria-label="Folder navigation" className="mt-3 flex flex-wrap items-center gap-0.5">
                <button type="button" onClick={() => navigateTo(null)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                    !currentFolder ? "bg-orange-100 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400" : "text-(--text-muted) hover:bg-(--bg-2) hover:text-(--text)",
                  )}>
                  <Home size={12} /> Root
                </button>
                {breadcrumb.map((b, i) => (
                  <span key={b.id} className="flex items-center gap-0.5">
                    <ChevronRight size={12} className="text-(--text-muted)" />
                    <button type="button" onClick={() => navigateTo(b)}
                      className={cn(
                        "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                        i === breadcrumb.length - 1
                          ? "bg-orange-100 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
                          : "text-(--text-muted) hover:bg-(--bg-2) hover:text-(--text)",
                      )}>
                      {truncate(b.name, 24)}
                    </button>
                  </span>
                ))}
              </nav>
            </div>
          </div>

          {/* ── Project data strip ── */}
          {!loading && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                { label: currentFolder ? "Subfolders" : "Root Folders", value: folders.length.toLocaleString(), sub: `${activeFolderCount} active`, icon: <FolderOpen size={14} />, color: "text-orange-500" },
                { label: "Direct Files", value: directFileCount.toLocaleString(), sub: totalFilesSize > 0 ? formatBytes(totalFilesSize) : "No files here", icon: <Files size={14} />, color: "text-blue-500" },
                { label: "Nested Contents", value: (folderFileCount + nestedFolderCount).toLocaleString(), sub: `${folderFileCount} files · ${nestedFolderCount} folders`, icon: <GitBranch size={14} />, color: "text-green-500" },
                { label: "Storage", value: totalSize > 0 ? formatBytes(totalSize) : "0 B", sub: totalFolderSize > 0 ? `${formatBytes(totalFolderSize)} in folders` : "Current scope", icon: <Database size={14} />, color: "text-purple-500" },
                { label: "Last Change", value: latestUpdatedAt ? formatRelative(latestUpdatedAt) : "—", sub: latestUpdatedAt ? formatDateTime(latestUpdatedAt) : "No activity", icon: <CalendarDays size={14} />, color: "text-red-500" },
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

          {/* ── Toolbar ── */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-72">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search folders & files…" value={search}
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
              {/* Sort buttons */}
              <div className="hidden items-center gap-0.5 rounded-xl border border-gray-200/80 bg-white px-2 py-1 sm:flex dark:border-zinc-700 dark:bg-zinc-900">
                {(["name", "size", "createdAt"] as SortField[]).map((f) => (
                  <button key={f} type="button" onClick={() => handleSort(f)}
                    className={cn(
                      "flex items-center gap-0.5 rounded-lg px-2.5 py-1 text-xs font-medium transition",
                      sortField === f
                        ? "bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400"
                        : "text-(--text-muted) hover:text-(--text)",
                    )}>
                    {f === "createdAt" ? "Date" : f.charAt(0).toUpperCase() + f.slice(1)}
                    {sortField === f && (sortDir === "asc" ? <SortAsc size={10} /> : <SortDesc size={10} />)}
                  </button>
                ))}
              </div>

              {/* View toggle */}
              <div className="flex overflow-hidden rounded-xl border border-gray-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                {(["grid", "list"] as ViewMode[]).map((v) => (
                  <button key={v} type="button" onClick={() => setView(v)} aria-label={`${v} view`}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center transition-all",
                      view === v
                        ? "bg-orange-500 text-white"
                        : "text-(--text-muted) hover:bg-gray-50 hover:text-orange-500 dark:hover:bg-zinc-800",
                    )}>
                    {v === "grid" ? <LayoutGrid size={15} /> : <List size={15} />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div className="flex min-h-64 items-center justify-center"><Spinner size={28} /></div>

          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200/80 bg-white py-24 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-50 dark:bg-zinc-800">
                <FolderOpen size={30} className="text-gray-300 dark:text-zinc-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-(--text)">
                  {search ? "No results found" : currentFolder ? "This folder is empty" : "No folders yet"}
                </p>
                <p className="mt-0.5 text-sm text-(--text-muted)">
                  {search ? `Nothing matches "${search}"` : currentFolder ? "Upload files or create sub-folders here" : "Create your first folder to organise files"}
                </p>
              </div>
              {!search && (
                <div className="flex items-center gap-3">
                  <Button variant="secondary" leftIcon={<Upload size={14} />} onClick={() => setShowUpload(true)}>Upload</Button>
                  <Button leftIcon={<FolderPlus size={14} />}
                    onClick={() => { setFolderName(""); setFolderDescription(""); setFolderColor("orange"); setShowCreate(true); }}>
                    New Folder
                  </Button>
                </div>
              )}
            </div>

          ) : (
            <div className="space-y-8">

              {/* ── Folders section ── */}
              {filteredFolders.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-widest text-(--text-muted)">
                      Folders · {filteredFolders.length}
                    </p>
                    {currentFolder && breadcrumb.length > 0 && (
                      <button type="button" onClick={() => navigateTo(breadcrumb[breadcrumb.length - 2] ?? null)}
                        className="flex items-center gap-1 text-xs text-(--text-muted) transition hover:text-(--text)">
                        <ChevronLeft size={12} /> Back
                      </button>
                    )}
                  </div>

                  {view === "grid" ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {filteredFolders.map((folder) => (
                        <EnhancedFolderCard
                          key={folder.id}
                          folder={folder}
                          onClick={() => navigateTo(folder)}
                          onRename={() => {
                            setRenameTarget(folder);
                            setFolderName(folder.name);
                            setFolderDescription(folder.description ?? "");
                            setFolderColor(folder.color ?? "orange");
                            setShowRename(true);
                          }}
                          onDelete={() => { setDeleteTarget(folder); setShowDeleteConfirm(true); }}
                        />
                      ))}
                    </div>
                  ) : (
                    /* Folder list view */
                    <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                          <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-zinc-800 dark:bg-zinc-800/30">
                            <tr>
                              {[
                                { label: "Name",       field: "name" as SortField | null },
                                { label: "Files",      field: null },
                                { label: "Subfolders", field: null },
                                { label: "Uploaded By",field: null },
                                { label: "Size",       field: "size" as SortField | null },
                                { label: "Created",    field: "createdAt" as SortField | null },
                                { label: "",           field: null },
                              ].map(({ label, field }, i) => (
                                <th key={i} scope="col"
                                  onClick={field ? () => handleSort(field) : undefined}
                                  className={cn(
                                    "px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-(--text-muted)",
                                    field && "cursor-pointer select-none hover:text-(--text)",
                                  )}>
                                  <span className="flex items-center gap-1">
                                    {label}
                                    {field && sortField === field && (
                                      sortDir === "asc" ? <SortAsc size={11} className="text-orange-500" /> : <SortDesc size={11} className="text-orange-500" />
                                    )}
                                  </span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                            {filteredFolders.map((folder) => {
                              const clr = getFolderColors(folder.color);
                              return (
                                <tr key={folder.id}
                                  onClick={() => navigateTo(folder)}
                                  className="cursor-pointer transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                                  <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-3">
                                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", clr.bg)}>
                                        <FolderOpen size={18} className={clr.text} />
                                      </div>
                                      <div>
                                        <p title={folder.name} className="max-w-52 truncate text-xs font-semibold text-(--text)">
                                          {truncate(folder.name, 36)}
                                        </p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-(--text-muted)">
                                          <span className="font-mono">{folder.id.slice(0, 12)}…</span>
                                          {folder.path && (
                                            <span className="inline-flex max-w-48 items-center gap-1 truncate">
                                              <Route size={9} />
                                              {truncate(folder.path, 36)}
                                            </span>
                                          )}
                                          <span className="inline-flex items-center gap-1 capitalize">
                                            <ShieldCheck size={9} />
                                            {folder.status ?? "active"}
                                          </span>
                                        </div>
                                        {folder.description && (
                                          <p className="mt-0.5 max-w-64 truncate text-[11px] text-(--text-muted)">
                                            {folder.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3.5 text-xs text-(--text-muted)">
                                    {folder.fileCount !== undefined ? folder.fileCount : "—"}
                                  </td>
                                  <td className="px-5 py-3.5 text-xs text-(--text-muted)">
                                    {folder.subfolderCount !== undefined ? folder.subfolderCount : "—"}
                                  </td>
                                  <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-2">
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
                                        {folderPersonLabel(folder).slice(0, 2).toUpperCase()}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="max-w-36 truncate text-xs font-semibold text-(--text)">
                                          {folderPersonLabel(folder)}
                                        </p>
                                        {folderPersonEmail(folder) && (
                                          <p className="max-w-36 truncate text-[11px] text-(--text-muted)">
                                            {folderPersonEmail(folder)}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3.5 text-xs text-(--text-muted)">
                                    {folder.totalSize !== undefined ? formatBytes(folder.totalSize) : "—"}
                                  </td>
                                  <td className="whitespace-nowrap px-5 py-3.5">
                                    <p className="text-xs text-(--text-muted)">{formatRelative(folder.createdAt)}</p>
                                    <p className="text-[11px] text-(--text-muted)">Updated {formatRelative(folder.updatedAt ?? folder.createdAt)}</p>
                                  </td>
                                  <td className="px-5 py-3.5">
                                    <div
                                      className="flex items-center justify-end gap-1"
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => e.stopPropagation()}>
                                      <button type="button" aria-label="Rename folder"
                                        onClick={() => {
                                          setRenameTarget(folder);
                                          setFolderName(folder.name);
                                          setFolderDescription(folder.description ?? "");
                                          setFolderColor(folder.color ?? "orange");
                                          setShowRename(true);
                                        }}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-orange-300 hover:text-orange-500 dark:border-zinc-700 dark:bg-zinc-800">
                                        <Edit3 size={12} />
                                      </button>
                                      <button type="button" aria-label="Delete folder"
                                        onClick={() => { setDeleteTarget(folder); setShowDeleteConfirm(true); }}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-red-300 hover:text-red-500 dark:border-zinc-700 dark:bg-zinc-800">
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* ── Files section (inside a folder) ── */}
              {filteredFiles.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center gap-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-(--text-muted)">
                      Files · {filteredFiles.length}
                    </p>
                    {currentFolder && (
                      <div className="flex items-center gap-1.5 rounded-full border border-orange-200/60 bg-orange-50/80 px-2.5 py-0.5 text-[10px] text-orange-600 dark:border-orange-900/30 dark:bg-orange-950/20 dark:text-orange-400">
                        <FolderIcon size={9} />
                        <span className="font-medium">In: {truncate(currentFolder.name, 28)}</span>
                      </div>
                    )}
                    {totalFilesSize > 0 && (
                      <span className="text-[11px] text-(--text-muted)">{formatBytes(totalFilesSize)}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
                    {filteredFiles.map((f) => (
                      <FileCard key={f.id} file={f} onRefresh={() => doRefresh(true)} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

        </div>

        {/* ── Create Folder Modal ── */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
            role="dialog" aria-modal="true" aria-labelledby="create-folder-title">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)} aria-hidden="true" />
            <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
              <div className="h-1 w-full bg-linear-to-r from-orange-500 to-amber-500" />
              <form onSubmit={createFolder} className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 dark:bg-orange-900/20">
                  <FolderPlus size={22} />
                </div>
                <h2 id="create-folder-title" className="mb-4 text-lg font-bold text-(--text)">New Folder</h2>
                <Input id="folder-name" label="Folder Name" placeholder="e.g. Project Assets"
                  value={folderName} onChange={(e) => setFolderName(e.target.value)} required autoFocus />
                <label htmlFor="folder-description" className="mt-4 block text-xs font-semibold text-(--text-muted)">
                  Description
                </label>
                <textarea id="folder-description" rows={3} placeholder="Short note about what this folder contains"
                  value={folderDescription} onChange={(e) => setFolderDescription(e.target.value)}
                  className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-(--text-muted)">Color</p>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_NAMES.map((c) => (
                      <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setFolderColor(c)}
                        className={cn(
                          "h-7 w-7 rounded-full transition-all",
                          FOLDER_COLORS[c].dot,
                          folderColor === c ? "ring-2 ring-offset-2 ring-orange-500 scale-110" : "opacity-70 hover:opacity-100",
                        )} />
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex flex-col gap-3">
                  <Button variant="secondary" fullWidth rounded="xl" type="button"
                    onClick={() => { setShowCreate(false); setFolderName(""); setFolderDescription(""); }}>
                    Cancel
                  </Button>
                  <Button fullWidth rounded="xl" type="submit" loading={submitting} leftIcon={<FolderPlus size={14} />}>
                    Create
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Rename Folder Modal ── */}
        {showRename && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
            role="dialog" aria-modal="true" aria-labelledby="rename-folder-title">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRename(false)} aria-hidden="true" />
            <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
              <div className="h-1 w-full bg-linear-to-r from-orange-500 to-amber-500" />
              <form onSubmit={renameFolder} className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 dark:bg-orange-900/20">
                  <Edit3 size={22} />
                </div>
                <h2 id="rename-folder-title" className="mb-4 text-lg font-bold text-(--text)">Edit Folder</h2>
                <Input id="rename-folder" label="Folder Name" placeholder="Enter new folder name"
                  value={folderName} onChange={(e) => setFolderName(e.target.value)} required autoFocus />
                <label htmlFor="rename-description" className="mt-4 block text-xs font-semibold text-(--text-muted)">
                  Description
                </label>
                <textarea id="rename-description" rows={3} placeholder="Short note about what this folder contains"
                  value={folderDescription} onChange={(e) => setFolderDescription(e.target.value)}
                  className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-(--text-muted)">Color</p>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_NAMES.map((c) => (
                      <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setFolderColor(c)}
                        className={cn(
                          "h-7 w-7 rounded-full transition-all",
                          FOLDER_COLORS[c].dot,
                          folderColor === c ? "ring-2 ring-offset-2 ring-orange-500 scale-110" : "opacity-70 hover:opacity-100",
                        )} />
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex flex-col gap-3">
                  <Button variant="secondary" fullWidth rounded="xl" type="button"
                    onClick={() => { setShowRename(false); setRenameTarget(null); setFolderName(""); setFolderDescription(""); }}>
                    Cancel
                  </Button>
                  <Button fullWidth rounded="xl" type="submit" loading={submitting} leftIcon={<Edit3 size={14} />}>
                    Save
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Delete Confirmation ── */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
            role="dialog" aria-modal="true" aria-labelledby="delete-folder-title">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} aria-hidden="true" />
            <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
              <div className="h-1 w-full bg-linear-to-r from-red-500 to-rose-500" />
              <div className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-900/20">
                  <AlertTriangle size={22} />
                </div>
                <h2 id="delete-folder-title" className="mb-1.5 text-lg font-bold text-(--text)">
                  Delete &ldquo;{deleteTarget?.name}&rdquo;?
                </h2>
                <p className="mb-2 text-sm text-(--text-muted)">
                  This folder and all its contents will be permanently deleted.
                  {(deleteTarget?.fileCount || deleteTarget?.subfolderCount) ? (
                    <span className="ml-1 font-semibold text-red-500">
                      ({deleteTarget.fileCount ?? 0} file{(deleteTarget.fileCount ?? 0) !== 1 ? "s" : ""}
                      {(deleteTarget.subfolderCount ?? 0) > 0 && ` and ${deleteTarget.subfolderCount} subfolder${deleteTarget.subfolderCount !== 1 ? "s" : ""}`} will be lost)
                    </span>
                  ) : null}
                </p>
                <p className="mb-5 text-xs font-semibold text-red-500">This action cannot be undone.</p>
                <div className="flex flex-col gap-3">
                  <Button variant="secondary" fullWidth rounded="xl" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                  <Button variant="danger" fullWidth rounded="xl" loading={submitting} leftIcon={<Trash2 size={14} />} onClick={confirmDelete}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Upload Modal ── */}
        <UploadModal
          open={showUpload}
          onClose={() => setShowUpload(false)}
          folderId={currentFolder?.id}
          onUploadComplete={() => doRefresh(true)}
        />

      </DashboardLayout>
    </AuthGuard>
  );
}

/* ─────────────────────────────────────────────
   ENHANCED FOLDER CARD
───────────────────────────────────────────── */
function EnhancedFolderCard({
  folder, onClick, onRename, onDelete,
}: {
  folder: Folder;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const clr = getFolderColors(folder.color);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300/70 hover:shadow-xl hover:shadow-orange-500/5 dark:border-zinc-700/60 dark:bg-zinc-900">

      {/* Full-card click overlay — no interactive children so nesting is valid */}
      <button
        type="button"
        onClick={onClick}
        aria-label={`Open folder ${folder.name}`}
        className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
      />

      {/* Folder icon with file-count badge */}
      <div className="relative z-10 mb-4 w-fit pointer-events-none">
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", clr.bg)}>
          <FolderOpen size={28} className={clr.text} />
        </div>
        {folder.fileCount !== undefined && folder.fileCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
            {folder.fileCount > 99 ? "99+" : folder.fileCount}
          </span>
        )}
      </div>

      {/* Name */}
      <p title={folder.name} className="relative z-10 mb-2 truncate font-semibold text-(--text) pointer-events-none">
        {truncate(folder.name, 24)}
      </p>
      {folder.description && (
        <p className="relative z-10 mb-2 line-clamp-2 text-xs text-(--text-muted) pointer-events-none">
          {folder.description}
        </p>
      )}

      {/* Meta chips */}
      <div className="relative z-10 flex flex-wrap gap-1.5 pointer-events-none">
        {folder.fileCount !== undefined && (
          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted) dark:bg-zinc-800">
            {folder.fileCount} file{folder.fileCount !== 1 ? "s" : ""}
          </span>
        )}
        {folder.subfolderCount !== undefined && folder.subfolderCount > 0 && (
          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted) dark:bg-zinc-800">
            {folder.subfolderCount} folder{folder.subfolderCount !== 1 ? "s" : ""}
          </span>
        )}
        {folder.totalSize !== undefined && folder.totalSize > 0 && (
          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted) dark:bg-zinc-800">
            {formatBytes(folder.totalSize)}
          </span>
        )}
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-(--text-muted) dark:bg-zinc-800">
          {folder.status ?? "active"}
        </span>
      </div>

      {/* Folder project metadata */}
      <div className="relative z-10 mt-3 space-y-1 text-[11px] text-(--text-muted) pointer-events-none">
        <p className="flex items-center gap-1 truncate">
          <UserRound size={10} />
          <span className="truncate">Uploaded by {folderPersonLabel(folder)}</span>
        </p>
        {folder.path && (
          <p className="flex items-center gap-1 truncate">
            <Route size={10} />
            <span className="truncate">{folder.path}</span>
          </p>
        )}
        <p className="flex items-center gap-1">
          <CalendarDays size={10} />
          Created {formatRelative(folder.createdAt)}
        </p>
        <p className="flex items-center gap-1">
          <Clock3 size={10} />
          Updated {formatRelative(folder.updatedAt ?? folder.createdAt)}
        </p>
      </div>

      {/* Hover action buttons — z-20 sits above the overlay button */}
      <div className="absolute right-3 top-3 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" aria-label="Rename folder" onClick={onRename}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-orange-300 hover:text-orange-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-400">
          <Edit3 size={12} />
        </button>
        <button type="button" aria-label="Delete folder" onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-red-300 hover:text-red-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-400">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Color accent bar at bottom */}
      <div className={cn("absolute bottom-0 left-0 h-0.5 w-full opacity-0 transition-opacity group-hover:opacity-100", clr.dot)} />
    </div>
  );
}
