"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Modal } from "@/components/ui";
import { filesApi, foldersApi } from "@/lib/api";
import { FileItem } from "@/types";
import {
  Folder, FolderOpen, File, CheckCircle,
  ChevronRight, Search, AlertCircle, Loader2,
  Image as ImageIcon, Video, Music, FileText, Archive, Database,
} from "lucide-react";
import { formatBytes } from "@/lib/utils";
import Button from "@/components/ui/Button";

/* ──────────────────────────────────────────
   Types
────────────────────────────────────────── */
interface RawFolder {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
}

interface RawApiFolder {
  id?: string;
  _id?: string;
  name?: string;
  parentId?: unknown;
  path?: string;
}

interface FilesListPayload {
  files?: FileItem[];
  pagination?: {
    total?: number;
    totalPages?: number;
    page?: number;
    limit?: number;
  };
  total?: number;
}

export interface PickedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  extension: string;
  relativePath?: string;
}

interface StoragePickerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (files: PickedFile[]) => void;
  alreadySelectedIds?: Set<string>;
}

/* ──────────────────────────────────────────
   Helpers
────────────────────────────────────────── */

/** Extract string ID from a raw folder/file ID field (ObjectId, object, or string). */
function extractId(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  const o = val as Record<string, unknown>;
  return (o._id as string | undefined) ?? (o.id as string | undefined) ?? null;
}

/** Normalize folderId from a FileItem (may be a populated object or string). */
function fileFolderId(file: FileItem): string | null {
  return extractId(file.folderId as unknown);
}

function fileId(file: FileItem): string {
  return extractId(file) ?? "";
}

function fileName(file: FileItem): string {
  return file.name ?? file.fileName ?? file.originalName ?? "Untitled file";
}

function cleanPath(path?: string | null): string {
  return (path ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function fileIcon(mimeType = "", ext = "") {
  if (mimeType.startsWith("image/"))  return <ImageIcon size={13} className="shrink-0 text-blue-500" />;
  if (mimeType.startsWith("video/"))  return <Video   size={13} className="shrink-0 text-purple-500" />;
  if (mimeType.startsWith("audio/"))  return <Music   size={13} className="shrink-0 text-pink-500" />;
  if (mimeType.includes("pdf"))       return <FileText size={13} className="shrink-0 text-red-500" />;
  const archiveExts = ["zip", "rar", "7z", "gz", "tar"];
  if (archiveExts.includes(ext.toLowerCase())) return <Archive size={13} className="shrink-0 text-amber-500" />;
  return <File size={13} className="shrink-0 text-gray-400" />;
}

function parseFilesPayload(data: unknown): FilesListPayload {
  const inner = (data as { data?: unknown })?.data ?? data;
  if (Array.isArray(inner)) return { files: inner as FileItem[], total: inner.length };
  return (inner ?? {}) as FilesListPayload;
}

function IndeterminateCheckbox({ checked, indeterminate, onChange, label }: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 rounded accent-orange-500"
      aria-label={label}
    />
  );
}

/* ══════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════ */
export default function StoragePickerModal({
  open,
  onClose,
  onConfirm,
  alreadySelectedIds,
}: StoragePickerModalProps) {
  const [allFolders, setAllFolders] = useState<RawFolder[]>([]);
  const [allFiles,   setAllFiles]   = useState<FileItem[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error,   setError]         = useState("");

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb]           = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "My Storage" },
  ]);

  /** id → PickedFile for everything the user has checked */
  const [selected, setSelected] = useState<Map<string, PickedFile>>(new Map());
  const [search, setSearch]     = useState("");

  /* ── Load all data once per open ── */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [fRes, filesRes] = await Promise.all([
        foldersApi.list(),
        filesApi.list({ page: 1, limit: 300, sortBy: "createdAt", sortOrder: "desc" }),
      ]);

      /* Normalise folders */
      const rawFolders = fRes.data?.data ?? fRes.data ?? [];
      const fArr = Array.isArray(rawFolders) ? rawFolders : [];
      setAllFolders(
        (fArr as RawApiFolder[]).map((f) => ({
          id:       extractId(f) ?? f._id ?? "",
          name:     f.name ?? "Untitled folder",
          parentId: extractId(f.parentId),
          path:     f.path ?? "/",
        })),
      );

      /* Normalise files */
      const firstPayload = parseFilesPayload(filesRes.data);
      const firstFiles = firstPayload.files ?? [];
      const total =
        firstPayload.pagination?.total ??
        firstPayload.total ??
        firstFiles.length;
      const pageLimit = firstPayload.pagination?.limit ?? 300;
      const totalPages =
        firstPayload.pagination?.totalPages ??
        Math.ceil(total / pageLimit);

      if (totalPages > 1) {
        const extraPages = Array.from(
          { length: Math.min(totalPages, 20) - 1 },
          (_, i) => i + 2,
        );
        const extraResults = await Promise.all(
          extraPages.map((page) =>
            filesApi.list({ page, limit: pageLimit, sortBy: "createdAt", sortOrder: "desc" }),
          ),
        );
        const extraFiles = extraResults.flatMap((res) => parseFilesPayload(res.data).files ?? []);
        setAllFiles([...firstFiles, ...extraFiles]);
      } else {
        setAllFiles(firstFiles);
      }
    } catch {
      setError("Could not load your storage. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        void load();
        setCurrentFolderId(null);
        setBreadcrumb([{ id: null, name: "My Storage" }]);
        setSearch("");
      });
    }
  }, [open, load]);

  /* ── Derived lists for the current location ── */
  const visibleFolders = allFolders.filter((f) => f.parentId === currentFolderId);

  const visibleFiles = allFiles.filter((f) => {
    const fid = fileFolderId(f);
    return currentFolderId === null ? !fid : fid === currentFolderId;
  });

  const searchedFolders = search
    ? visibleFolders.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : visibleFolders;

  const searchedFiles = search
    ? visibleFiles.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : visibleFiles;

  const folderById = useMemo(
    () => new Map(allFolders.map((folder) => [folder.id, folder])),
    [allFolders],
  );
  const folderPathCache = new Map<string, string>();

  function folderPath(folder: RawFolder): string {
    const cached = folderPathCache.get(folder.id);
    if (cached !== undefined) return cached;

    const parentPath = cleanPath(folder.path);
    const parent = folder.parentId ? folderById.get(folder.parentId) : null;
    const path = cleanPath(
      parentPath
        ? `${parentPath}/${folder.name}`
        : parent
          ? `${folderPath(parent)}/${folder.name}`
          : folder.name,
    );
    folderPathCache.set(folder.id, path);
    return path;
  }

  function fileRelativePath(file: FileItem): string | undefined {
    const folderId = fileFolderId(file);
    if (!folderId) return undefined;
    const folder = folderById.get(folderId);
    if (!folder) return undefined;
    return cleanPath(`${folderPath(folder)}/${fileName(file)}`);
  }

  function descendantFolderIds(folderId: string): Set<string> {
    const ids = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      allFolders.forEach((folder) => {
        if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          changed = true;
        }
      });
    }
    return ids;
  }

  function filesInFolderTree(folder: RawFolder): FileItem[] {
    const ids = descendantFolderIds(folder.id);
    return allFiles.filter((file) => {
      const folderId = fileFolderId(file);
      return folderId ? ids.has(folderId) : false;
    });
  }

  /* ── Navigation ── */
  const navigateInto = useCallback((folder: RawFolder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearch("");
  }, []);

  const navigateTo = useCallback((idx: number) => {
    setBreadcrumb((prev) => prev.slice(0, idx + 1));
    setCurrentFolderId(breadcrumb[idx].id);
    setSearch("");
  }, [breadcrumb]);

  /* ── Selection helpers ── */
  function toPickedFile(f: FileItem): PickedFile {
    const relativePath = fileRelativePath(f);
    return {
      id: fileId(f),
      name: fileName(f),
      size: f.size ?? 0,
      mimeType: f.mimeType ?? "",
      extension: f.extension ?? "",
      ...(relativePath ? { relativePath } : {}),
    };
  }

  function toggleFile(f: FileItem) {
    const id = fileId(f);
    if (!id) return;

    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, toPickedFile(f));
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Map(prev);
      visibleFiles.forEach((f) => {
        const id = fileId(f);
        if (id && !alreadySelectedIds?.has(id)) next.set(id, toPickedFile(f));
      });
      return next;
    });
  }

  function deselectAllVisible() {
    setSelected((prev) => {
      const next = new Map(prev);
      visibleFiles.forEach((f) => next.delete(fileId(f)));
      return next;
    });
  }

  /** Checkbox handler for a folder card — toggles every file in that folder tree. */
  function toggleFolderFiles(folder: RawFolder) {
    const folderFiles = filesInFolderTree(folder);
    const allChecked  = folderFiles.length > 0 && folderFiles.every((f) => {
      const id = fileId(f);
      return Boolean(id) && (selected.has(id) || alreadySelectedIds?.has(id));
    });
    setSelected((prev) => {
      const next = new Map(prev);
      if (allChecked) {
        folderFiles.forEach((f) => next.delete(fileId(f)));
      } else {
        folderFiles.forEach((f) => {
          const id = fileId(f);
          if (id && !alreadySelectedIds?.has(id)) next.set(id, toPickedFile(f));
        });
      }
      return next;
    });
  }

  /* ── Indeterminate ref helper ── */
  const allCurrentSelected = visibleFiles.length > 0 && visibleFiles.every((f) => {
    const id = fileId(f);
    return Boolean(id) && (selected.has(id) || alreadySelectedIds?.has(id));
  });
  const someCurrentSelected = visibleFiles.some((f) => selected.has(fileId(f)));

  /* ── Confirm ── */
  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selected.values()));
    setSelected(new Map());
    onClose();
  }, [onConfirm, selected, onClose]);

  const totalSelectedSize = Array.from(selected.values()).reduce((s, f) => s + f.size, 0);
  const isEmpty = searchedFolders.length === 0 && searchedFiles.length === 0;

  /* ══════════════════════════════════════
     RENDER
  ══════════════════════════════════════ */
  return (
    <Modal open={open} onClose={onClose} title="Pick Files from Storage" width={640}>

      {/* Breadcrumb */}
      <nav aria-label="Folder breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs">
        {breadcrumb.map((crumb, idx) => (
          <span key={idx} className="flex items-center gap-1">
            {idx > 0 && <ChevronRight size={11} className="shrink-0 text-gray-300 dark:text-zinc-600" />}
            <button
              type="button"
              onClick={() => navigateTo(idx)}
              disabled={idx === breadcrumb.length - 1}
              className={[
                "rounded px-1 py-0.5 transition-colors",
                idx === breadcrumb.length - 1
                  ? "font-semibold text-(--text) cursor-default"
                  : "text-(--text-muted) hover:text-orange-500 hover:underline",
              ].join(" ")}
            >
              {idx === 0 ? (
                <span className="flex items-center gap-1"><Database size={10} /> {crumb.name}</span>
              ) : crumb.name}
            </button>
          </span>
        ))}
      </nav>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files and folders…"
          className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-8 pr-3 text-sm text-(--text) outline-none placeholder:text-gray-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      {/* Content area */}
      {loading ? (
        <div className="flex h-52 items-center justify-center">
          <Loader2 size={26} className="animate-spin text-orange-500" />
        </div>
      ) : error ? (
        <div className="flex h-44 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle size={22} className="text-red-400" />
          <p className="text-sm text-red-500">{error}</p>
          <button type="button" onClick={load} className="text-xs font-semibold text-orange-500 hover:underline">
            Retry
          </button>
        </div>
      ) : (
        <div className="custom-scrollbar max-h-72 overflow-y-auto rounded-xl border border-gray-100 dark:border-zinc-800">

          {/* Select-all row (only shown when there are files in the current view) */}
          {visibleFiles.length > 0 && !search && (
            <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-gray-100 bg-gray-50/95 px-3 py-2 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
              <IndeterminateCheckbox
                checked={allCurrentSelected}
                indeterminate={!allCurrentSelected && someCurrentSelected}
                onChange={() => allCurrentSelected ? deselectAllVisible() : selectAllVisible()}
                label={`Select all ${visibleFiles.length} files in this folder`}
              />
              <span className="text-xs text-(--text-muted)">
                Select all {visibleFiles.length} file{visibleFiles.length !== 1 ? "s" : ""} in this folder
              </span>
            </div>
          )}

          {/* Folder rows */}
          {searchedFolders.map((folder) => {
            const folderFiles    = filesInFolderTree(folder);
            const childFolders   = allFolders.filter((f) => f.parentId === folder.id);
            const allFolderChk   = folderFiles.length > 0 && folderFiles.every((f) => {
              const id = fileId(f);
              return Boolean(id) && (selected.has(id) || alreadySelectedIds?.has(id));
            });
            const someFolderChk  = folderFiles.some((f) => selected.has(fileId(f)));
            const hasFiles       = folderFiles.length > 0;

            return (
              <div key={folder.id}
                className="flex items-center gap-2 border-b border-gray-50 px-3 py-2.5 hover:bg-gray-50 dark:border-zinc-800/50 dark:hover:bg-zinc-800/40">
                {/* Folder checkbox — selects all direct files */}
                {hasFiles ? (
                  <IndeterminateCheckbox
                    checked={allFolderChk}
                    indeterminate={!allFolderChk && someFolderChk}
                    onChange={() => toggleFolderFiles(folder)}
                    label={`Select all files in ${folder.name}`}
                  />
                ) : (
                  <div className="h-4 w-4 shrink-0" />
                )}

                {/* Navigate into folder */}
                <button
                  type="button"
                  onClick={() => navigateInto(folder)}
                  className="flex flex-1 items-center gap-2 overflow-hidden rounded-lg text-left transition-colors"
                >
                  <Folder size={15} className="shrink-0 text-orange-400" />
                  <span className="flex-1 truncate text-sm font-medium text-(--text)">{folder.name}</span>
                  <span className="shrink-0 text-[11px] text-(--text-muted)">
                    {hasFiles
                      ? `${folderFiles.length} file${folderFiles.length !== 1 ? "s" : ""}`
                      : childFolders.length > 0
                        ? `${childFolders.length} folder${childFolders.length !== 1 ? "s" : ""}`
                        : "Empty"}
                  </span>
                  <ChevronRight size={13} className="shrink-0 text-gray-300 dark:text-zinc-600" />
                </button>
              </div>
            );
          })}

          {/* File rows */}
          {searchedFiles.map((f) => {
            const id = fileId(f);
            const isSelected  = selected.has(id);
            const isAlready   = alreadySelectedIds?.has(id) ?? false;

            return (
              <label
                key={id}
                className={[
                  "flex cursor-pointer items-center gap-2.5 border-b border-gray-50 px-3 py-2 transition-colors dark:border-zinc-800/50",
                  isAlready  ? "cursor-not-allowed opacity-50" : "",
                  isSelected ? "bg-orange-50/60 dark:bg-orange-900/10" : "hover:bg-gray-50 dark:hover:bg-zinc-800/40",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={isSelected || isAlready}
                  disabled={isAlready}
                  onChange={() => !isAlready && toggleFile(f)}
                  className="h-4 w-4 shrink-0 rounded accent-orange-500"
                />
                {fileIcon(f.mimeType, f.extension)}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-(--text)">{fileName(f)}</p>
                  <p className="text-[11px] text-(--text-muted)">{formatBytes(f.size ?? 0)}</p>
                </div>
                {isSelected && <CheckCircle size={13} className="shrink-0 text-orange-500" />}
                {isAlready  && <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-900/20">Added</span>}
              </label>
            );
          })}

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
              <FolderOpen size={28} className="text-gray-300 dark:text-zinc-600" />
              <p className="text-sm font-medium text-(--text-muted)">
                {search ? `No results for "${search}"` : currentFolderId ? "This folder is empty" : "No files in your storage yet"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-(--text-muted)">
          {selected.size > 0
            ? `${selected.size} file${selected.size !== 1 ? "s" : ""} selected · ${formatBytes(totalSelectedSize)}`
            : "Select files or use folder checkboxes to add all files in a folder"
          }
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={selected.size === 0}
            onClick={handleConfirm}
          >
            Add {selected.size > 0 ? `${selected.size} File${selected.size !== 1 ? "s" : ""}` : "to Transfer"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
