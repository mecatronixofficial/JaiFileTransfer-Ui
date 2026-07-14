"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { FileCard } from "@/components/files/FileCard";
import { FileTypeIcon } from "@/components/ui/FileTypeIcon";
import { Spinner } from "@/components/ui";
import { filesApi, foldersApi } from "@/lib/api";
import { listenAppDataChanged } from "@/lib/app-events";
import type { FileItem, Folder } from "@/types";
import UploadModal from "@/components/modals/UploadModal";
import {
  AlertTriangle, FileText, Files, FolderOpen, Folder as FolderIcon,
  Image as ImageIcon, LayoutGrid, List, RefreshCw, Send, Trash2,
  Upload, Video, FileSpreadsheet, X, Search,
  SortAsc, SortDesc, MoveRight, CheckSquare, Square,
  HardDrive, ChevronLeft, ChevronRight, Download, Star, ShieldCheck, UserRound, Users,
  CalendarDays, Clock3, Database, GitBranch, Route, ChevronDown,
} from "lucide-react";
import { handleApiError } from "@/lib/error-handler";
import { bulkDeleteFiles, deleteFile } from "@/lib/file-delete";
import { showToast } from "@/lib/toast";
import Button from "@/components/ui/Button";
import { cn, formatBytes, formatRelative, formatDateTime, truncate } from "@/lib/utils";

/* ─── Types & constants ─── */
type SortField  = "name" | "size" | "createdAt";
type SortDir    = "asc" | "desc";
type TypeFilter = "all" | "image" | "video" | "document" | "spreadsheet" | "other";
type ViewMode   = "grid" | "list";
type OwnerRole = "superadmin" | "admin" | "user";
type OwnerRoleFilter = "all" | OwnerRole;

type OwnedFileItem = FileItem & {
  uploadedBy?: { id?: string; _id?: string; name?: string; email?: string; role?: string };
};

function extractEntityId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const record = value as Record<string, unknown>;
  const id = record.id ?? record._id;
  if (typeof id === "string") return id;
  if (id && typeof id === "object" && "toString" in id) return String(id);
  return "";
}

function normalizeFile(file: FileItem): FileItem {
  return { ...file, id: extractEntityId(file) };
}

const PAGE_SIZE = 24;
const VALID_TYPE_FILTERS: TypeFilter[] = ["all", "image", "video", "document", "spreadsheet", "other"];
const VALID_OWNER_ROLE_FILTERS: OwnerRole[] = ["superadmin", "admin", "user"];

const TYPE_OPTIONS: {
  value: TypeFilter; label: string;
  icon: React.ReactNode; color: string; accent: string;
}[] = [
  { value: "all",         label: "All Files",    icon: <Files size={14} />,           color: "text-orange-500", accent: "bg-orange-500" },
  { value: "image",       label: "Images",       icon: <ImageIcon size={14} />,       color: "text-blue-500",   accent: "bg-blue-500" },
  { value: "video",       label: "Videos",       icon: <Video size={14} />,           color: "text-purple-500", accent: "bg-purple-500" },
  { value: "document",    label: "Documents",    icon: <FileText size={14} />,        color: "text-red-500",    accent: "bg-red-500" },
  { value: "spreadsheet", label: "Spreadsheets", icon: <FileSpreadsheet size={14} />, color: "text-green-500",  accent: "bg-green-500" },
  { value: "other",       label: "Other",        icon: <Files size={14} />,           color: "text-gray-500",   accent: "bg-gray-500" },
];

const OWNER_OPTIONS: {
  value: OwnerRoleFilter; label: string; icon: React.ReactNode; color: string;
}[] = [
  { value: "all", label: "All uploaders", icon: <Users size={14} />, color: "text-orange-500" },
  { value: "superadmin", label: "Superadmin files", icon: <ShieldCheck size={14} />, color: "text-rose-500" },
  { value: "admin", label: "Admin files", icon: <ShieldCheck size={14} />, color: "text-blue-500" },
  { value: "user", label: "User files", icon: <UserRound size={14} />, color: "text-green-500" },
];

function getFileType(file: Pick<FileItem, "mimeType" | "extension" | "originalName" | "name">): TypeFilter {
  const mime = (file.mimeType ?? "").toLowerCase();
  const ext = (file.extension || file.originalName?.split(".").pop() || file.name?.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "heic"].includes(ext)) return "image";
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm", "m4v"].includes(ext)) return "video";
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv") || ["xls", "xlsx", "csv", "ods"].includes(ext)) return "spreadsheet";
  if (
    mime.includes("pdf") ||
    mime.includes("word") ||
    mime.includes("document") ||
    mime.startsWith("text/") ||
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    ["pdf", "doc", "docx", "txt", "rtf", "ppt", "pptx", "pages", "odt"].includes(ext)
  ) return "document";
  return "other";
}

function getQueryType(value: string | null): TypeFilter {
  return value && VALID_TYPE_FILTERS.includes(value as TypeFilter) ? (value as TypeFilter) : "all";
}

function getQueryOwnerRole(value: string | null): OwnerRoleFilter {
  return value && VALID_OWNER_ROLE_FILTERS.includes(value as OwnerRole) ? (value as OwnerRole) : "all";
}

function getOwnerRole(file: OwnedFileItem): OwnerRole {
  const role = file.owner?.role ?? file.uploadedBy?.role;
  if (role === "superadmin" || role === "admin") return role;
  return "user";
}

function getOwnerLabel(file: OwnedFileItem) {
  return file.owner?.name ?? file.uploadedBy?.name ?? file.owner?.email ?? file.uploadedBy?.email ?? "Unknown owner";
}

function fileOwnerIds(file: FileItem): string[] {
  const owned = file as OwnedFileItem;
  return [
    file.ownerId,
    file.owner?.id,
    owned.uploadedBy?.id,
    owned.uploadedBy?._id,
  ].filter((id): id is string => Boolean(id));
}

function isFileOwner(file: FileItem, userId?: string) {
  return !!userId && fileOwnerIds(file).includes(userId);
}

function getFolderLabel(file: FileItem, folderMap: Map<string, string>) {
  const folder = file.folderId as unknown;
  if (folder && typeof folder === "object") {
    const data = folder as { id?: string; _id?: string; name?: string; path?: string };
    return data.name ?? data.path ?? (data.id || data._id ? "Folder" : "Root");
  }
  if (typeof folder === "string" && folder) return folderMap.get(folder) ?? "Folder";
  return "Root";
}

function getFolderKey(file: FileItem, folderMap: Map<string, string>) {
  const folder = file.folderId as unknown;
  if (folder && typeof folder === "object") {
    const data = folder as { id?: string; _id?: string; name?: string; path?: string };
    return data.id ?? data._id ?? data.path ?? data.name ?? "folder";
  }
  if (typeof folder === "string" && folder) return folder;
  const label = getFolderLabel(file, folderMap);
  return label === "Root" ? "root" : label;
}

type FileFolderGroup = {
  key: string;
  label: string;
  files: FileItem[];
  size: number;
};

/* ─── Suspense wrapper ─── */
export default function FilesPage() {
  return (
    <Suspense fallback={null}>
      <FilesPageContent />
    </Suspense>
  );
}

/* ════════════════════════════════════════════
   MAIN CONTENT
════════════════════════════════════════════ */
function FilesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const queryType = getQueryType(searchParams.get("type"));
  const ownerRoleFilter = getQueryOwnerRole(searchParams.get("ownerRole"));
  const includeFolderFiles = searchParams.get("folders") === "1";

  const [files,            setFiles]            = useState<FileItem[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const [total,            setTotal]            = useState(0);
  const [page,             setPage]             = useState(1);
  const [view,             setView]             = useState<ViewMode>("grid");
  const [search,           setSearch]           = useState("");
  const typeFilter = queryType;
  const [sortField,        setSortField]        = useState<SortField>("createdAt");
  const [sortDir,          setSortDir]          = useState<SortDir>("desc");
  const [selected,         setSelected]         = useState<Set<string>>(new Set());
  const [showUpload,       setShowUpload]       = useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm]= useState(false);
  const [showMoveModal,    setShowMoveModal]    = useState(false);
  const [folders,          setFolders]          = useState<Folder[]>([]);
  const [folderSearch,     setFolderSearch]     = useState("");
  const [movingFolderId,   setMovingFolderId]   = useState<string | null | undefined>(undefined);
  const [submitting,       setSubmitting]       = useState(false);
  const [expandedFolders,  setExpandedFolders]  = useState<Set<string>>(new Set());
  const isSuperadmin = user?.role === "superadmin";
  const currentUserId = user?.id ?? (user as { _id?: string } | null)?._id;

  /* folderId → name lookup */
  const folderMap = useMemo(
    () => new Map(folders.map((f) => [f.id, f.name])),
    [folders],
  );

  /* ── Load folder list for lookup + move modal ── */
  useEffect(() => {
    foldersApi.list().then((res) => {
      const arr = res.data?.folders ?? res.data?.data ?? res.data ?? [];
      setFolders(
        Array.isArray(arr)
          ? arr.map((folder) => ({ ...folder, id: extractEntityId(folder) }))
          : [],
      );
    }).catch(() => {});
  }, []);

  /* ── Load files (server-side: pagination + search) ── */
  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const params: Record<string, unknown> = { page, limit: PAGE_SIZE };
      if (search.trim()) params.q = search.trim();
      if (typeFilter !== "all") params.type = typeFilter;
      if (typeFilter !== "all" && includeFolderFiles) params.includeFolderFiles = true;
      if (isSuperadmin && ownerRoleFilter !== "all") params.ownerRole = ownerRoleFilter;
      const res = await filesApi.list(params);
      const inner = res.data?.data ?? res.data;
      const f: FileItem[] = inner?.files ?? (Array.isArray(inner) ? inner : []);
      setFiles(f.map(normalizeFile));
      setTotal(inner?.pagination?.total ?? inner?.total ?? f.length);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search, typeFilter, includeFolderFiles, isSuperadmin, ownerRoleFilter]);

  useEffect(() => {
    const t = setTimeout(() => load(), search ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    return listenAppDataChanged((detail) => {
      if (detail.files || detail.folders || detail.storage) void load(true);
    });
  }, [load]);

  /* ── Client-side: type filter + sort ── */
  const filtered = useMemo(() => {
    let items = files;
    if (typeFilter !== "all") items = items.filter((f) => getFileType(f) === typeFilter);
    return [...items].sort((a, b) => {
      let diff = 0;
      if (sortField === "name")      diff = a.name.localeCompare(b.name);
      else if (sortField === "size") diff = (a.size ?? 0) - (b.size ?? 0);
      else                           diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "asc" ? diff : -diff;
    });
  }, [files, typeFilter, sortField, sortDir]);

  /* ── Stats from current page ── */
  const typeStats = useMemo(() => {
    const counts: Record<TypeFilter, number> = { all: files.length, image: 0, video: 0, document: 0, spreadsheet: 0, other: 0 };
    for (const f of files) counts[getFileType(f)]++;
    return counts;
  }, [files]);

  const ownerStats = useMemo(() => {
    const counts: Record<OwnerRoleFilter, number> = { all: files.length, superadmin: 0, admin: 0, user: 0 };
    for (const f of files) counts[getOwnerRole(f as OwnedFileItem)]++;
    return counts;
  }, [files]);

  const totalSize  = useMemo(() => files.reduce((s, f) => s + (f.size ?? 0), 0), [files]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const selectedFiles = useMemo(
    () => files.filter((file) => selected.has(file.id)),
    [files, selected],
  );
  const selectedSendable = useMemo(
    () => selectedFiles.filter((file) => isFileOwner(file, currentUserId)),
    [currentUserId, selectedFiles],
  );
  const rootFileCount = useMemo(() => files.filter((f) => getFolderLabel(f, folderMap) === "Root").length, [files, folderMap]);
  const folderFileCount = Math.max(files.length - rootFileCount, 0);
  const sharedCount = useMemo(() => files.filter((f) => f.isShared).length, [files]);
  const latestUpdatedAt = useMemo(() => {
    const dates = files
      .map((file) => file.updatedAt ?? file.createdAt)
      .filter(Boolean)
      .map((date) => new Date(date).getTime())
      .filter(Number.isFinite);
    return dates.length ? new Date(Math.max(...dates)).toISOString() : undefined;
  }, [files]);
  const activeFileCount = useMemo(
    () => files.filter((file) => !file.status || file.status === "active").length,
    [files],
  );

  /* ── Selection ── */
  function toggleSelect(id: string, sel: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (sel) n.add(id);
      else n.delete(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((f) => f.id)));
  }

  function toggleFolderGroup(key: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /* ── Sort ── */
  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  /* ── Type filter (resets page) ── */
  function setType(t: TypeFilter) {
    setPage(1);
    setSelected(new Set());
    const params = new URLSearchParams(searchParams.toString());
    if (t === "all") {
      params.delete("type");
      params.delete("folders");
    } else {
      params.set("type", t);
    }
    const query = params.toString();
    router.replace(query ? `/files?${query}` : "/files");
  }

  function setIncludeFolderFiles(next: boolean) {
    setPage(1);
    setSelected(new Set());
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("folders", "1");
    else params.delete("folders");
    const query = params.toString();
    router.replace(query ? `/files?${query}` : "/files");
  }

  function setOwnerRole(role: OwnerRoleFilter) {
    setPage(1);
    setSelected(new Set());
    const params = new URLSearchParams(searchParams.toString());
    if (role === "all") params.delete("ownerRole");
    else params.set("ownerRole", role);
    const query = params.toString();
    router.replace(query ? `/files?${query}` : "/files");
  }

  /* ── Actions ── */
  function handleSendSelected() {
    if (selectedSendable.length === 0) {
      showToast.error("You can only send files uploaded by you");
      return;
    }
    const payload = selectedSendable
      .map((file) => ({
        id: extractEntityId(file),
        key: file.key,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        extension: file.extension,
      }))
      .filter((file) => file.id);
    sessionStorage.setItem("pending_send", JSON.stringify(payload));
    router.push("/transfers/send");
  }

  async function confirmBulkDelete() {
    setShowDeleteConfirm(false);
    const deleted = await bulkDeleteFiles(Array.from(selected));
    if (deleted) {
      setSelected(new Set());
      load(true);
    }
  }

  async function handleMoveToFolder(folderId: string | null) {
    setMovingFolderId(folderId);
    setSubmitting(true);
    try {
      await filesApi.bulkMove(Array.from(selected), folderId);
      showToast.success(`${selected.size} file${selected.size > 1 ? "s" : ""} moved`);
      setSelected(new Set());
      setShowMoveModal(false);
      load(true);
    } catch (err) { handleApiError(err); }
    setSubmitting(false);
    setMovingFolderId(undefined);
  }

  const filteredFolders = useMemo(
    () => folderSearch ? folders.filter((f) => f.name.toLowerCase().includes(folderSearch.toLowerCase())) : folders,
    [folders, folderSearch],
  );

  const activeMeta = TYPE_OPTIONS.find((t) => t.value === typeFilter)!;
  const groupedFiles = useMemo(() => {
    const root: FileItem[] = [];
    const folderGroups = new Map<string, FileFolderGroup>();

    for (const file of filtered) {
      const label = getFolderLabel(file, folderMap);
      if (label === "Root") {
        root.push(file);
        continue;
      }

      const key = getFolderKey(file, folderMap);
      const group = folderGroups.get(key) ?? { key, label, files: [], size: 0 };
      group.files.push(file);
      group.size += file.size ?? 0;
      folderGroups.set(key, group);
    }

    return {
      root,
      folders: [...folderGroups.values()].sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [filtered, folderMap]);
  const sectionLabel = typeFilter === "all" ? "Files" : activeMeta.label;

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="-mx-3 min-h-[calc(100vh-4rem)] bg-gray-50/70 px-3 pb-10 pt-1 dark:bg-zinc-950 sm:-mx-5 sm:px-5">
          <div className="space-y-4">

          {/* ── Hero header ── */}
          <div className="border-b border-gray-200/80 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950 sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-400">
                    <Files size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase text-orange-600 dark:text-orange-400">File library</p>
                  <h1 className="truncate text-2xl font-extrabold tracking-tight text-(--text)">
                    {activeMeta.label}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-(--text-muted)">
                    <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900">
                      <Route size={10} />
                      {typeFilter === "all" ? "All files" : activeMeta.label}
                      {typeFilter !== "all" && (includeFolderFiles ? " · folders included" : " · root only")}
                    </span>
                    {latestUpdatedAt && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900">
                        <Clock3 size={10} />
                        Updated {formatRelative(latestUpdatedAt)}
                      </span>
                    )}
                    {ownerRoleFilter !== "all" && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-blue-600 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-400">
                        <UserRound size={10} />
                        {OWNER_OPTIONS.find((option) => option.value === ownerRoleFilter)?.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary" size="sm"
                  leftIcon={<RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />}
                  onClick={() => load(true)} disabled={refreshing || loading} aria-label="Refresh">
                  Refresh
                </Button>
                <Button leftIcon={<Upload size={15} />} onClick={() => setShowUpload(true)}>
                  Upload
                </Button>
              </div>
            </div>
          </div>

          {/* ── Project data strip ── */}
          {!loading && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 dark:border-zinc-800 dark:bg-zinc-800 lg:grid-cols-5">
              {[
                { label: "Current Scope", value: filtered.length.toLocaleString(), sub: typeFilter === "all" ? "All file types" : activeMeta.label, icon: activeMeta.icon, color: activeMeta.color },
                { label: "Root Files", value: rootFileCount.toLocaleString(), sub: `${activeFileCount} active on page`, icon: <Files size={14} />, color: "text-blue-500" },
                { label: "Folder Contents", value: folderFileCount.toLocaleString(), sub: includeFolderFiles ? "Included in view" : "Hidden by default", icon: <GitBranch size={14} />, color: "text-green-500" },
                { label: "Storage", value: totalSize > 0 ? formatBytes(totalSize) : "0 B", sub: `${sharedCount} shared file${sharedCount !== 1 ? "s" : ""}`, icon: <Database size={14} />, color: "text-purple-500" },
                { label: "Last Change", value: latestUpdatedAt ? formatRelative(latestUpdatedAt) : "—", sub: latestUpdatedAt ? formatDateTime(latestUpdatedAt) : "No activity", icon: <CalendarDays size={14} />, color: "text-red-500" },
              ].map((stat) => (
                <div key={stat.label} className="bg-white px-4 py-3 dark:bg-zinc-950">
                  <div className={`mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase ${stat.color}`}>
                    {stat.icon}
                    {stat.label}
                  </div>
                  <p className="text-xl font-extrabold tabular-nums text-(--text)">{stat.value}</p>
                  <p className="mt-0.5 truncate text-[11px] text-(--text-muted)">{stat.sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Type stat cards (6 chips) ── */}
          <div className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
            {TYPE_OPTIONS.map((t) => {
              const count = typeStats[t.value];
              const active = typeFilter === t.value;
              return (
                <button key={t.value} type="button" onClick={() => setType(t.value)}
                  className={cn(
                    "group flex min-w-[8.5rem] items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all duration-200",
                    active
                      ? "border-orange-500 bg-orange-500 text-white shadow-sm shadow-orange-500/20"
                      : "border-transparent bg-gray-50 hover:bg-gray-100 dark:bg-zinc-900 dark:hover:bg-zinc-800",
                  )}>
                  <span className={cn("shrink-0 transition-opacity", active ? "text-white" : t.color)}>
                    {t.icon}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-xs font-bold", active ? "text-white" : "text-(--text)")}>{t.label}</span>
                    {loading
                      ? <span className="mt-1 block h-3 w-6 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
                      : <span className={cn("block text-[11px]", active ? "text-white/75" : "text-(--text-muted)")}>{count} items</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {isSuperadmin && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {OWNER_OPTIONS.map((option) => {
                const active = ownerRoleFilter === option.value;
                const count = ownerStats[option.value];
                return (
                  <button key={option.value} type="button" onClick={() => setOwnerRole(option.value)}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-200",
                      active
                        ? "border-orange-300 bg-white shadow-sm dark:border-orange-900/40 dark:bg-zinc-950"
                        : "border-gray-200 bg-white/70 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/70",
                    )}>
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-(--bg-2)", option.color)}>
                      {option.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-(--text)">{option.label}</span>
                      <span className="text-xs text-(--text-muted)">
                        {loading ? "Loading" : `${count} file${count !== 1 ? "s" : ""}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Toolbar ── */}
          <div className="sticky top-16 z-20 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm shadow-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search files…" value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-7 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-500/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:focus:bg-zinc-950"
                />
                {search && (
                  <button type="button" aria-label="Clear search" onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Sort */}
              <div className="hidden items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-1 sm:flex dark:border-zinc-800 dark:bg-zinc-900">
                {(["name", "size", "createdAt"] as SortField[]).map((f) => (
                  <button key={f} type="button" onClick={() => handleSort(f)}
                    className={cn(
                      "flex h-8 items-center gap-0.5 rounded-md px-2.5 text-xs font-semibold transition",
                      sortField === f
                        ? "bg-white text-orange-600 shadow-sm dark:bg-zinc-950 dark:text-orange-400"
                        : "text-(--text-muted) hover:text-(--text)",
                    )}>
                    {f === "createdAt" ? "Date" : f.charAt(0).toUpperCase() + f.slice(1)}
                    {sortField === f && (sortDir === "asc" ? <SortAsc size={10} /> : <SortDesc size={10} />)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {typeFilter !== "all" && (
                <button type="button" onClick={() => setIncludeFolderFiles(!includeFolderFiles)}
                  className={cn(
                    "flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition",
                    includeFolderFiles
                      ? "border-orange-300 bg-orange-50 text-orange-600 dark:border-orange-700/50 dark:bg-orange-950/20 dark:text-orange-400"
                      : "border-gray-200 bg-gray-50 text-(--text-muted) hover:border-orange-200 hover:text-orange-600 dark:border-zinc-800 dark:bg-zinc-900",
                  )}>
                  <FolderIcon size={13} />
                  {includeFolderFiles ? "Folder contents shown" : "Show folder contents"}
                </button>
              )}
              {!loading && filtered.length > 0 && (
                <button type="button" onClick={toggleAll}
                  className="flex items-center gap-1.5 text-xs font-semibold text-(--text-muted) transition-colors hover:text-(--text)">
                  {allSelected ? <CheckSquare size={14} className="text-orange-500" /> : <Square size={14} />}
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              )}
              <div className="flex overflow-hidden rounded-xl border border-gray-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                {(["grid", "list"] as ViewMode[]).map((v) => (
                  <button key={v} type="button" onClick={() => setView(v)} aria-label={`${v} view`}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center transition-all",
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

          {/* ── Bulk action bar ── */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-900 bg-zinc-950 px-4 py-3 text-white shadow-lg shadow-zinc-900/10 dark:border-orange-900/40 dark:bg-orange-950/20">
              <div className="flex h-7 min-w-7 items-center justify-center rounded-md bg-orange-500 px-2 text-xs font-bold text-white">
                {selected.size}
              </div>
              <span className="text-sm font-semibold">
                file{selected.size > 1 ? "s" : ""} selected
              </span>
              <button type="button" aria-label="Clear selection"
                onClick={() => setSelected(new Set())}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
                <X size={13} />
              </button>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" leftIcon={<MoveRight size={13} />}
                onClick={() => { setFolderSearch(""); setShowMoveModal(true); }}>
                Move to Folder
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<Send size={13} />}
                onClick={handleSendSelected}
                disabled={selectedSendable.length === 0}>
                Send
              </Button>
              <Button variant="danger" size="sm" glow={false} leftIcon={<Trash2 size={13} />}
                onClick={() => setShowDeleteConfirm(true)}>
                Delete
              </Button>
            </div>
          )}

          {/* ── Content ── */}
          {loading ? (
            <div className="flex min-h-64 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"><Spinner size={28} /></div>

          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white py-24 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-50 dark:bg-zinc-900">
                <FolderOpen size={30} className="text-gray-300 dark:text-zinc-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-(--text)">
                  {search ? "No files found" : typeFilter !== "all" ? `No ${activeMeta.label.toLowerCase()} yet` : "No files yet"}
                </p>
                <p className="mt-0.5 text-sm text-(--text-muted)">
                  {search ? `No results for "${search}"` : typeFilter !== "all" ? `Upload ${activeMeta.label.toLowerCase()} to see them here` : "Upload files to get started"}
                </p>
              </div>
              {!search && (
                <Button onClick={() => setShowUpload(true)} leftIcon={<Upload size={15} />}>
                  Upload Files
                </Button>
              )}
            </div>

          ) : view === "grid" ? (
            /* ── Grid view ── */
            <section>
              <FilesSectionHeader
                label={sectionLabel}
                count={filtered.length}
                size={totalSize}
                activeMetaLabel={activeMeta.label}
                typeFilter={typeFilter}
                includeFolderFiles={includeFolderFiles}
              />
              <div className="space-y-4">
                {groupedFiles.root.length > 0 && (
                  <section className="space-y-2.5">
                    <FolderGroupHeader
                      icon={<HardDrive size={15} />}
                      label="Root files"
                      count={groupedFiles.root.length}
                      size={groupedFiles.root.reduce((sum, file) => sum + (file.size ?? 0), 0)}
                      open
                    />
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-3">
                      {groupedFiles.root.map((f) => (
                        <div key={f.id} className="flex flex-col gap-1">
                          <FileCard
                            file={f}
                            onRefresh={() => load(true)}
                            selected={selected.has(f.id)}
                            onSelect={toggleSelect}
                          />
                          <FileMetaBadges file={f} folderMap={folderMap} />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {groupedFiles.folders.map((group) => {
                  const open = expandedFolders.has(group.key);
                  return (
                    <section key={group.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                      <button
                        type="button"
                        onClick={() => toggleFolderGroup(group.key)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-zinc-900"
                      >
                        <FolderGroupHeader
                          icon={<FolderIcon size={15} />}
                          label={group.label}
                          count={group.files.length}
                          size={group.size}
                          open={open}
                          compact
                        />
                      </button>
                      {open && (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-3 border-t border-gray-100 bg-gray-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                          {group.files.map((f) => (
                            <div key={f.id} className="flex flex-col gap-1">
                              <FileCard
                                file={f}
                                onRefresh={() => load(true)}
                                selected={selected.has(f.id)}
                                onSelect={toggleSelect}
                                folderView
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </section>

          ) : (
            /* ── List view ── */
            <section>
              <FilesSectionHeader
                label={sectionLabel}
                count={filtered.length}
                size={totalSize}
                activeMetaLabel={activeMeta.label}
                typeFilter={typeFilter}
                includeFolderFiles={includeFolderFiles}
              />
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm shadow-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                  <thead className="border-b border-gray-200 bg-gray-100/80 dark:border-zinc-800 dark:bg-zinc-900">
                    <tr>
                      <th className="w-12 px-4 py-3.5" scope="col">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll}
                          aria-label="Select all files" className="h-4 w-4 rounded accent-orange-500" />
                      </th>
                      {([
                        { label: "Name",     field: "name" as SortField | null },
                        { label: "Folder",   field: null },
                        { label: "Size",     field: "size" as SortField | null },
                        { label: "Type",     field: null },
                        { label: "Status",   field: null },
                        { label: "Uploaded", field: "createdAt" as SortField | null },
                        { label: "",         field: null },
                      ] as { label: string; field: SortField | null }[]).map(({ label, field }, i) => (
                        <th key={i} scope="col"
                          onClick={field ? () => handleSort(field) : undefined}
                          className={cn(
                            "px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-(--text-muted)",
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
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                    {groupedFiles.root.length > 0 && (
                      <Fragment>
                        <tr className="bg-white dark:bg-zinc-950">
                          <td colSpan={7} className="px-4 py-2.5">
                            <FolderGroupHeader
                              icon={<HardDrive size={14} />}
                              label="Root files"
                              count={groupedFiles.root.length}
                              size={groupedFiles.root.reduce((sum, file) => sum + (file.size ?? 0), 0)}
                              open
                              compact
                            />
                          </td>
                        </tr>
                        {groupedFiles.root.map((file) => (
                          <FileListRow
                            key={file.id}
                            file={file}
                            selected={selected.has(file.id)}
                            onSelect={toggleSelect}
                            folderName="Root"
                            ownerName={getOwnerLabel(file as OwnedFileItem)}
                            canManage={isSuperadmin || isFileOwner(file, currentUserId)}
                            canSend={isFileOwner(file, currentUserId)}
                            onRefresh={() => load(true)}
                            onSend={() => {
                              sessionStorage.setItem("pending_send", JSON.stringify([{ id: extractEntityId(file), key: file.key, name: file.name, size: file.size, mimeType: file.mimeType, extension: file.extension }]));
                              router.push("/transfers/send");
                            }}
                          />
                        ))}
                      </Fragment>
                    )}

                    {groupedFiles.folders.map((group) => {
                      const open = expandedFolders.has(group.key);
                      return (
                        <Fragment key={group.key}>
                          <tr className="bg-gray-50 dark:bg-zinc-900/60">
                            <td colSpan={7} className="p-0">
                              <button
                                type="button"
                                onClick={() => toggleFolderGroup(group.key)}
                                className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-gray-100 dark:hover:bg-zinc-900"
                              >
                                <FolderGroupHeader
                                  icon={<FolderIcon size={14} />}
                                  label={group.label}
                                  count={group.files.length}
                                  size={group.size}
                                  open={open}
                                  compact
                                />
                              </button>
                            </td>
                          </tr>
                          {open && group.files.map((file) => (
                            <FileListRow
                              key={file.id}
                              file={file}
                              selected={selected.has(file.id)}
                              onSelect={toggleSelect}
                              folderName={group.label}
                              ownerName={getOwnerLabel(file as OwnedFileItem)}
                              canManage={isSuperadmin || isFileOwner(file, currentUserId)}
                              canSend={isFileOwner(file, currentUserId)}
                              onRefresh={() => load(true)}
                              onSend={() => {
                                sessionStorage.setItem("pending_send", JSON.stringify([{ id: extractEntityId(file), key: file.key, name: file.name, size: file.size, mimeType: file.mimeType, extension: file.extension }]));
                                router.push("/transfers/send");
                              }}
                            />
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="text-xs text-(--text-muted)">
                  <span className="font-semibold text-(--text)">{filtered.length}</span> file{filtered.length !== 1 ? "s" : ""}
                  {" · "}<span className="font-semibold text-(--text)">{formatBytes(totalSize)}</span> on this page
                  {typeFilter !== "all" && <span className="ml-1.5 text-orange-500">· filtered by {activeMeta.label}</span>}
                </p>
              </div>
            </div>
            </section>
          )}

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs text-(--text-muted)">
                Page <span className="font-semibold text-(--text)">{page}</span> of {totalPages}
                {" · "}{total.toLocaleString()} total
              </p>
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label="Previous page" disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-500 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-40 dark:border-zinc-700 dark:text-gray-400">
                  <ChevronLeft size={13} /> Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                  return (
                    <button key={p} type="button" onClick={() => setPage(p)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium transition",
                        page === p
                          ? "border-orange-500 bg-orange-500 text-white"
                          : "border-gray-200 text-gray-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:border-zinc-700 dark:text-gray-400",
                      )}>
                      {p}
                    </button>
                  );
                })}
                <button type="button" aria-label="Next page" disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-500 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-40 dark:border-zinc-700 dark:text-gray-400">
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* ── Upload Modal ── */}
        <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploadComplete={() => load(true)} />

        {/* ── Bulk delete confirmation ── */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
            role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} aria-hidden="true" />
            <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
              <div className="h-1 w-full bg-linear-to-r from-red-500 to-rose-500" />
              <div className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-900/20">
                  <AlertTriangle size={22} />
                </div>
                <h2 id="delete-confirm-title" className="mb-1.5 text-lg font-bold text-(--text)">
                  Move {selected.size} file{selected.size > 1 ? "s" : ""} to trash?
                </h2>
                <p className="mb-5 text-sm text-(--text-muted)">
                  Files will be moved to trash. You can restore them within 30 days.
                </p>
                <div className="flex flex-col gap-3">
                  <Button variant="secondary" fullWidth rounded="xl" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                  <Button variant="danger" fullWidth rounded="xl" leftIcon={<Trash2 size={14} />} onClick={confirmBulkDelete}>
                    Move to Trash
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Move to Folder Modal ── */}
        {showMoveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
            role="dialog" aria-modal="true" aria-labelledby="move-modal-title">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMoveModal(false)} aria-hidden="true" />
            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
              <div className="h-1 w-full bg-linear-to-r from-orange-500 to-amber-500" />
              <div className="p-6">
                <h2 id="move-modal-title" className="mb-1 text-lg font-bold text-(--text)">
                  Move {selected.size} file{selected.size > 1 ? "s" : ""} to…
                </h2>
                <p className="mb-4 text-sm text-(--text-muted)">Choose a destination folder.</p>

                <div className="relative mb-3">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search folders…" value={folderSearch}
                    onChange={(e) => setFolderSearch(e.target.value)}
                    className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-8 pr-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-zinc-700">
                  {/* Root option */}
                  <button type="button" onClick={() => handleMoveToFolder(null)}
                    disabled={submitting && movingFolderId === null}
                    className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-sm transition hover:bg-orange-50 disabled:opacity-60 dark:border-zinc-800 dark:hover:bg-orange-950/20">
                    <HardDrive size={14} className="shrink-0 text-gray-400" />
                    <span className="font-medium text-(--text)">Root (no folder)</span>
                    {submitting && movingFolderId === null && <Spinner size={13} className="ml-auto" />}
                  </button>

                  {filteredFolders.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-(--text-muted)">No folders found</div>
                  ) : (
                    filteredFolders.map((folder) => (
                      <button key={folder.id} type="button"
                        onClick={() => handleMoveToFolder(folder.id)}
                        disabled={submitting && movingFolderId === folder.id}
                        className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-sm transition last:border-0 hover:bg-orange-50 disabled:opacity-60 dark:border-zinc-800 dark:hover:bg-orange-950/20">
                        <FolderOpen size={14} className="shrink-0 text-orange-400" />
                        <span className="truncate font-medium text-(--text)">{folder.name}</span>
                        {folder.fileCount !== undefined && (
                          <span className="ml-auto shrink-0 text-xs text-(--text-muted)">{folder.fileCount} files</span>
                        )}
                        {submitting && movingFolderId === folder.id && <Spinner size={13} />}
                      </button>
                    ))
                  )}
                </div>

                <Button variant="secondary" fullWidth rounded="xl" className="mt-4" onClick={() => setShowMoveModal(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

      </DashboardLayout>
    </AuthGuard>
  );
}

function FolderGroupHeader({
  icon,
  label,
  count,
  size,
  open,
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  size: number;
  open: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn(
          "flex shrink-0 items-center justify-center rounded-lg border",
          compact ? "h-8 w-8" : "h-9 w-9",
          label === "Root files"
            ? "border-blue-200 bg-blue-50 text-blue-500 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-400"
            : "border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-900/30 dark:bg-orange-950/20 dark:text-orange-400",
        )}>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className={cn("truncate font-bold text-(--text)", compact ? "text-sm" : "text-base")}>
            {label}
          </h2>
          <p className="truncate text-[11px] text-(--text-muted)">
            {count} file{count !== 1 ? "s" : ""} · {formatBytes(size)}
          </p>
        </div>
      </div>
      {label !== "Root files" && (
        <span className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-(--text-muted) transition dark:border-zinc-800 dark:bg-zinc-950",
          open && "rotate-180",
        )}>
          <ChevronDown size={14} />
        </span>
      )}
    </div>
  );
}

function FileMetaBadges({ file, folderMap }: { file: FileItem; folderMap: Map<string, string> }) {
  const owner = getOwnerLabel(file as OwnedFileItem);
  const folder = getFolderLabel(file, folderMap);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-(--text-muted) dark:border-zinc-800 dark:bg-zinc-950">
        <UserRound size={10} className="shrink-0" />
        <span className="truncate font-medium">Uploaded by {truncate(owner, 24)}</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-(--text-muted) dark:border-zinc-800 dark:bg-zinc-950">
        <FolderIcon size={10} className="shrink-0" />
        <span className="truncate font-medium">Folder: {truncate(folder, 24)}</span>
      </div>
    </div>
  );
}

function FilesSectionHeader({
  label,
  count,
  size,
  activeMetaLabel,
  typeFilter,
  includeFolderFiles,
}: {
  label: string;
  count: number;
  size: number;
  activeMetaLabel: string;
  typeFilter: TypeFilter;
  includeFolderFiles: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <p className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold uppercase text-(--text-muted) dark:border-zinc-800 dark:bg-zinc-950">
        {label} · {count}
      </p>
      {typeFilter !== "all" && (
        <div className="flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] text-orange-600 dark:border-orange-900/30 dark:bg-orange-950/20 dark:text-orange-400">
          <FileText size={9} />
          <span className="font-medium">{activeMetaLabel}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[10px] text-(--text-muted) dark:border-zinc-800 dark:bg-zinc-950">
        <FolderIcon size={9} />
        <span className="font-medium">{includeFolderFiles ? "Folder contents shown" : "Root files first"}</span>
      </div>
      {size > 0 && (
        <span className="text-[11px] text-(--text-muted)">{formatBytes(size)}</span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   FILE LIST ROW — custom table row with folder column
───────────────────────────────────────────── */
function FileListRow({
  file, selected, onSelect, folderName, ownerName, canManage, canSend, onRefresh, onSend,
}: {
  file: FileItem;
  selected: boolean;
  onSelect: (id: string, sel: boolean) => void;
  folderName?: string;
  ownerName?: string;
  canManage: boolean;
  canSend: boolean;
  onRefresh: () => void;
  onSend: () => void;
}) {
  async function handleDownload() {
    try {
      const res = await filesApi.download(file.id);
      const url = res.data?.data?.downloadUrl ?? res.data?.downloadUrl ?? res.data?.url;
      if (!url) throw new Error("No download URL");
      const a = document.createElement("a");
      a.href = url; a.download = file.originalName || file.name; a.rel = "noopener noreferrer";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      showToast.success("Download started");
    } catch (err) { handleApiError(err); }
  }

  async function handleTrash() {
    const deleted = await deleteFile(file.id);
    if (deleted) {
      onRefresh();
    }
  }

  const statusCls =
    file.isTrashed       ? "bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400"
    : file.status === "processing" ? "bg-blue-100 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400"
    : "bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-400";

  return (
    <tr className="transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-4 py-3.5">
        <input type="checkbox" aria-label={`Select ${file.name}`}
          checked={selected} onChange={(e) => onSelect(file.id, e.target.checked)}
          className="h-4 w-4 accent-orange-500" />
      </td>

      {/* Name */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-(--bg-2)">
            <FileTypeIcon mime={file.mimeType} ext={file.extension ?? ""} size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p title={file.name} className="max-w-48 truncate text-xs font-semibold text-(--text)">
                {truncate(file.name, 40)}
              </p>
              {file.isStarred && <Star size={10} className="shrink-0 fill-amber-400 text-amber-400" />}
              {file.isShared && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 dark:bg-blue-950/20 dark:text-blue-400">
                  Shared
                </span>
              )}
            </div>
            <p className="font-mono text-[11px] text-(--text-muted)">{file.id.slice(0, 12)}…</p>
            {ownerName && (
              <p className="max-w-48 truncate text-[11px] font-medium text-(--text-muted)">
                Uploaded by {ownerName}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Folder */}
      <td className="px-4 py-3.5">
        {folderName ? (
          <div className="inline-flex max-w-36 items-center gap-1 rounded-full border border-orange-200/60 bg-orange-50/80 px-2 py-0.5 text-[10px] text-orange-600 dark:border-orange-900/30 dark:bg-orange-950/20 dark:text-orange-400">
            <FolderIcon size={9} className="shrink-0" />
            <span className="truncate font-medium">{truncate(folderName, 18)}</span>
          </div>
        ) : (
          <span className="text-xs text-(--text-muted)">—</span>
        )}
      </td>

      {/* Size */}
      <td className="px-4 py-3.5 text-xs text-(--text-muted)">{formatBytes(file.size)}</td>

      {/* Type */}
      <td className="px-4 py-3.5">
        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-(--text-muted) dark:bg-zinc-800">
          {file.extension?.toUpperCase() || file.mimeType?.split("/")[1]?.toUpperCase() || "—"}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusCls}`}>
          {file.isTrashed ? "trashed" : (file.status ?? "active")}
        </span>
      </td>

      {/* Date */}
      <td className="whitespace-nowrap px-4 py-3.5">
        <p className="text-xs text-(--text-muted)">{formatRelative(file.createdAt)}</p>
        <p className="text-[11px] text-(--text-muted)">{formatDateTime(file.createdAt)}</p>
      </td>

      {/* Actions */}
      <td className="px-4 py-3.5">
        <div className="flex items-center justify-end gap-1">
          {canSend && (
            <button type="button" aria-label="Send file" onClick={onSend}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-blue-300 hover:text-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-400">
              <Send size={12} />
            </button>
          )}
          <button type="button" aria-label="Download file" onClick={handleDownload}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-green-300 hover:text-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-400">
            <Download size={12} />
          </button>
          {canManage && (
            <button type="button" aria-label="Move to trash" onClick={handleTrash}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-red-300 hover:text-red-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-400">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
