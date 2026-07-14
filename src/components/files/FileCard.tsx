"use client";

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Edit3,
  ExternalLink,
  Folder,
  MoreVertical,
  RotateCcw,
  Share2,
  Trash2,
  X,
} from "lucide-react";

import type { FileItem } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatBytes, formatRelative, getFileColorClass, truncate } from "@/lib/utils";
import { FileTypeIcon } from "@/components/ui/FileTypeIcon";
import { filesApi } from "@/lib/api";
import { handleApiError } from "@/lib/error-handler";
import { deleteFile } from "@/lib/file-delete";
import { showToast } from "@/lib/toast";
import { Badge, DropdownMenu } from "@/components/ui";
import Button from "../ui/Button";

/* =========================================================
   TYPES
========================================================= */

interface FileCardProps {
  file: FileItem;
  onRefresh: () => void;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  isTrash?: boolean;
  isShared?: boolean;
  folderView?: boolean;
}

export type MenuItem =
  | {
      label: string;
      icon?: ReactNode;
      onClick?: () => void;
      danger?: boolean;
      disabled?: boolean;
      divider?: false;
    }
  | { divider: true };

function extractFileId(file: FileItem): string {
  const record = file as FileItem & { _id?: unknown; id?: unknown };
  if (typeof record.id === "string") return record.id;
  if (typeof record._id === "string") return record._id;
  if (record.id && typeof record.id === "object" && "toString" in record.id) return String(record.id);
  if (record._id && typeof record._id === "object" && "toString" in record._id) return String(record._id);
  return "";
}

/* =========================================================
   ACTIONS HOOK
========================================================= */

function useFileActions(file: FileItem, onRefresh: () => void) {
  const router = useRouter();
  const fileId = extractFileId(file);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(file.name);

  const handleDownload = useCallback(async () => {
    try {
      const res = await filesApi.download(fileId);
      const url: string =
        res.data?.data?.downloadUrl ??
        res.data?.downloadUrl ??
        res.data?.url;
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
  }, [fileId, file.originalName, file.name]);

  const handleDelete = useCallback(async () => {
    const deleted = await deleteFile(fileId);
    if (deleted) {
      onRefresh();
    }
  }, [fileId, onRefresh]);

  const handleRestore = useCallback(async () => {
    try {
      await filesApi.restore(fileId);
      showToast.success("File restored");
      onRefresh();
    } catch (err) {
      handleApiError(err);
    }
  }, [fileId, onRefresh]);

  const handlePermanentDelete = useCallback(async () => {
    if (!window.confirm("Permanently delete this file? This action cannot be undone.")) return;
    try {
      await filesApi.permanentDelete(fileId);
      showToast.success("File permanently deleted");
      onRefresh();
    } catch (err) {
      handleApiError(err);
    }
  }, [fileId, onRefresh]);

  const handleRename = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === file.name) {
      setNewName(file.name);
      setRenaming(false);
      return;
    }
    try {
      await filesApi.rename(fileId, trimmed);
      showToast.success("File renamed");
      setRenaming(false);
      onRefresh();
    } catch (err) {
      handleApiError(err);
    }
  }, [fileId, file.name, newName, onRefresh]);

  const handleShare = useCallback(() => {
    if (!fileId) {
      showToast.error("This file is missing its server ID. Please refresh and try again.");
      return;
    }
    sessionStorage.setItem(
      "pending_send",
      JSON.stringify([{
        id: fileId,
        key: file.key,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        extension: file.extension,
      }]),
    );
    router.push("/transfers/send");
  }, [fileId, file.key, file.name, file.size, file.mimeType, file.extension, router]);

  const handleManageShares = useCallback(() => {
    router.push(`/shared?file=${fileId}`);
  }, [fileId, router]);

  return {
    renaming,
    setRenaming,
    newName,
    setNewName,
    handleDownload,
    handleDelete,
    handleRestore,
    handlePermanentDelete,
    handleRename,
    handleShare,
    handleManageShares,
  };
}

type FileWithOwner = FileItem & {
  uploadedBy?: string | { id?: string; _id?: string };
  createdBy?: string | { id?: string; _id?: string };
};

function readOwnerId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return undefined;
  const record = value as { id?: string; _id?: string };
  return record.id ?? record._id;
}

function fileOwnerIds(file: FileItem): string[] {
  const owned = file as FileWithOwner;
  return [
    file.ownerId,
    file.owner?.id,
    readOwnerId(owned.uploadedBy),
    readOwnerId(owned.createdBy),
  ].filter((id): id is string => Boolean(id));
}

function getFileTone(file: FileItem) {
  const mime = file.mimeType ?? "";
  const ext = (file.extension || file.name?.split(".").pop() || "").toLowerCase();

  if (mime.startsWith("image/")) {
    return {
      accent: "bg-blue-500",
      icon: "bg-blue-500/10 text-blue-600 ring-blue-500/15",
      chip: "border-blue-500/20 bg-blue-500/10 text-blue-600",
    };
  }

  if (mime.startsWith("video/")) {
    return {
      accent: "bg-violet-500",
      icon: "bg-violet-500/10 text-violet-600 ring-violet-500/15",
      chip: "border-violet-500/20 bg-violet-500/10 text-violet-600",
    };
  }

  if (mime.startsWith("audio/")) {
    return {
      accent: "bg-pink-500",
      icon: "bg-pink-500/10 text-pink-600 ring-pink-500/15",
      chip: "border-pink-500/20 bg-pink-500/10 text-pink-600",
    };
  }

  if (mime === "application/pdf" || ext === "pdf") {
    return {
      accent: "bg-red-500",
      icon: "bg-red-500/10 text-red-600 ring-red-500/15",
      chip: "border-red-500/20 bg-red-500/10 text-red-600",
    };
  }

  if (mime.includes("zip") || mime.includes("rar") || mime.includes("tar")) {
    return {
      accent: "bg-amber-500",
      icon: "bg-amber-500/10 text-amber-600 ring-amber-500/15",
      chip: "border-amber-500/20 bg-amber-500/10 text-amber-600",
    };
  }

  if (mime.startsWith("text/") || mime.includes("javascript") || mime.includes("json")) {
    return {
      accent: "bg-emerald-500",
      icon: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/15",
      chip: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
    };
  }

  return {
    accent: "bg-orange-500",
    icon: "bg-orange-500/10 text-orange-600 ring-orange-500/15",
    chip: "border-orange-500/20 bg-orange-500/10 text-orange-600",
  };
}

function getFileLabel(file: FileItem): string {
  const ext = file.extension || file.originalName?.split(".").pop() || file.name?.split(".").pop();
  if (ext) return ext.toUpperCase();
  return file.mimeType?.split("/")[1]?.toUpperCase() || "FILE";
}

/* =========================================================
   FILE CARD
========================================================= */

export function FileCard({
  file,
  onRefresh,
  selected = false,
  onSelect,
  isTrash = false,
  isShared = false,
  folderView = false,
}: FileCardProps) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const fileId = extractFileId(file);
  const currentUserId = user?.id ?? (user as { _id?: string } | null)?._id;
  const isSuperadmin = user?.role === "superadmin";
  const isOwner = !!currentUserId && fileOwnerIds(file).includes(currentUserId);
  const canManage = isSuperadmin || isOwner;
  const canSend = isOwner;
  const tone = getFileTone(file);
  const typeLabel = getFileLabel(file);

  const {
    renaming, setRenaming,
    newName, setNewName,
    handleDownload,
    handleDelete,
    handleRestore,
    handlePermanentDelete,
    handleRename,
    handleShare,
    handleManageShares,
  } = useFileActions(file, onRefresh);

  const menuItems: MenuItem[] = useMemo(() => {
    if (isTrash) {
      return [
        { label: "Restore", icon: <RotateCcw size={14} />, onClick: handleRestore, disabled: !canManage },
        { divider: true },
        { label: "Delete Forever", icon: <X size={14} />, onClick: handlePermanentDelete, danger: true, disabled: !canManage },
      ];
    }

    return [
      { label: "Download", icon: <Download size={14} />, onClick: handleDownload },
      { label: "Rename", icon: <Edit3 size={14} />, onClick: () => setRenaming(true), disabled: !canManage },
      {
        label: isShared ? "Manage Sharing" : "Send / Share",
        icon: isShared ? <ExternalLink size={14} /> : <Share2 size={14} />,
        onClick: isShared ? handleManageShares : handleShare,
        disabled: isShared ? !canManage : !canSend,
      },
      { divider: true },
      { label: "Move to Trash", icon: <Trash2 size={14} />, onClick: handleDelete, danger: true, disabled: !canManage },
    ];
  }, [
    isTrash, isShared, canManage, canSend,
    handleDownload, handleDelete, handleRestore, handlePermanentDelete,
    handleShare, handleManageShares, setRenaming,
  ]);

  return (
    <div className="group/card relative pr-3 pt-3">
      {/* MENU */}
      <div className="absolute right-0 top-0 z-30">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((prev) => !prev); }}
          className="h-8 w-8 rounded-full border border-(--border) bg-(--bg-card) text-(--text-muted) shadow-md shadow-black/5 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500 dark:hover:bg-orange-950/20"
        >
          <MoreVertical size={16} />
        </Button>

        {menuOpen && (
          <DropdownMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={{ current: null }}
            items={menuItems}
          />
        )}
      </div>

      <div
        className={cn(
          "relative border bg-(--bg-card) shadow-sm transition-all duration-300",
          folderView
            ? "min-h-20 rounded-xl p-3"
            : "min-h-[172px] rounded-2xl p-4",
          selected
            ? "border-orange-500 shadow-lg shadow-orange-500/15 ring-2 ring-orange-500/10"
            : "border-(--border) hover:-translate-y-0.5 hover:border-(--border-hover) hover:shadow-lg",
        )}
      >
        {/* SELECT */}
        {onSelect && (
          <input
            type="checkbox"
            aria-label={`Select ${file.name}`}
            checked={selected}
            onChange={(e) => onSelect(fileId, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-3 top-3 z-20 h-4 w-4 rounded border-(--border) accent-orange-500"
          />
        )}

        {folderView ? (
          <div className={cn("flex min-h-14 items-center gap-3", onSelect && "pl-6")}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/15">
              <Folder size={24} />
            </div>
            {renaming ? (
              <input
                autoFocus
                aria-label="Rename file"
                placeholder={file.name}
                value={newName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") { setRenaming(false); setNewName(file.name); }
                }}
                className="h-10 min-w-0 flex-1 rounded-lg border border-orange-500 bg-(--bg-2) px-3 text-sm text-(--text-primary) outline-none ring-4 ring-orange-500/10"
              />
            ) : (
              <p title={file.name} className="min-w-0 truncate text-sm font-semibold text-(--text-primary)">
                {truncate(file.name, 34)}
              </p>
            )}
          </div>
        ) : (
          <>
            {/* FILE ICON */}
            <div className={cn("flex items-start justify-between gap-3", onSelect && "pl-6")}>
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1",
                  tone.icon,
                  getFileColorClass(file.mimeType),
                )}
              >
                <FileTypeIcon mime={file.mimeType} ext={file.extension || ""} size={28} />
              </div>
              <span className={cn("inline-flex h-6 max-w-20 items-center truncate rounded-md border px-2 text-[10px] font-semibold leading-none", tone.chip)}>
                {typeLabel}
              </span>
            </div>

            {/* FILE NAME */}
            <div className="mt-4">
              {renaming ? (
                <input
                  autoFocus
                  aria-label="Rename file"
                  placeholder={file.name}
                  value={newName}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") { setRenaming(false); setNewName(file.name); }
                  }}
                  className="h-10 w-full rounded-lg border border-orange-500 bg-(--bg-2) px-3 text-sm text-(--text-primary) outline-none ring-4 ring-orange-500/10"
                />
              ) : (
                <h3
                  title={file.name}
                  className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[var(--text)]"
                >
                  {truncate(file.name, 42)}
                </h3>
              )}
            </div>

            {/* META */}
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-(--border) pt-3 text-[11px] text-[var(--text-muted)]">
              <span className="truncate font-medium">{formatBytes(file.size)}</span>
              <span className="truncate text-right font-medium">{formatRelative(file.createdAt)}</span>
            </div>

            {/* SHARED BADGE */}
            {file.isShared && !isShared && (
              <div className="mt-3 flex justify-end">
                <Badge variant="info">Shared</Badge>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   FILE ROW
========================================================= */

export function FileRow({
  file,
  onRefresh,
  selected = false,
  onSelect,
  isTrash = false,
}: FileCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const fileId = extractFileId(file);

  const { handleDownload, handleDelete, handleRestore, handlePermanentDelete } =
    useFileActions(file, onRefresh);

  const menuItems: MenuItem[] = useMemo(
    () =>
      isTrash
        ? [
            { label: "Restore", icon: <RotateCcw size={14} />, onClick: handleRestore },
            { label: "Delete Forever", icon: <X size={14} />, onClick: handlePermanentDelete, danger: true },
          ]
        : [
            { label: "Download", icon: <Download size={14} />, onClick: handleDownload },
            { label: "Move to Trash", icon: <Trash2 size={14} />, onClick: handleDelete, danger: true },
          ],
    [isTrash, handleDownload, handleDelete, handleRestore, handlePermanentDelete],
  );

  return (
    <tr className="border-b border-(--border) transition-colors hover:bg-(--bg-2)">
      {/* SELECT */}
      <td className="px-4 py-4">
        {onSelect && (
          <input
            type="checkbox"
            aria-label={`Select ${file.name}`}
            checked={selected}
            onChange={(e) => onSelect(fileId, e.target.checked)}
            className="h-4 w-4 accent-orange-500"
          />
        )}
      </td>

      {/* FILE */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--bg-2) text-xl">
            <FileTypeIcon mime={file.mimeType} ext={file.extension || ""} size={20} />
          </div>
          <p title={file.name} className="max-w-[260px] truncate text-sm font-medium">
            {truncate(file.name, 40)}
          </p>
        </div>
      </td>

      {/* SIZE */}
      <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
        {formatBytes(file.size)}
      </td>

      {/* TYPE */}
      <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
        {file.mimeType?.split("/")[1]?.toUpperCase() || "—"}
      </td>

      {/* DATE */}
      <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
        {formatRelative(file.createdAt)}
      </td>

      {/* SHARED */}
      <td className="px-4 py-4">
        {file.isShared && <Badge variant="info">Shared</Badge>}
      </td>

      {/* ACTIONS */}
      <td className="px-4 py-4">
        <div className="relative flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((prev) => !prev); }}
            className="h-9 w-9 rounded-xl text-gray-500 hover:text-orange-500"
          >
            <MoreVertical size={16} />
          </Button>

          {menuOpen && (
            <DropdownMenu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              anchorRef={{ current: null }}
              items={menuItems}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
