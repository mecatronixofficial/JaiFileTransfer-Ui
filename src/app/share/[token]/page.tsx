"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  Archive,
  CheckCircle,
  ChevronRight,
  Clock,
  Code,
  Copy,
  Check,
  Download,
  Eye,
  EyeOff,
  File,
  FileText,
  Folder,
  CloudUpload,
  Image,
  Loader2,
  Lock,
  Music,
  Send,
  Shield,
  Sparkles,
  Table2,
  Video,
  XCircle,
} from "lucide-react";
import { sharesApi } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/utils";

/* ─── Types ─── */

type ShareInfo = {
  shareToken: string;
  type: string;
  resourceType: "file" | "folder";
  permission: "view" | "download";
  expiresAt?: string | null;
  isPasswordProtected: boolean;
  name?: string | null;
  message?: string | null;
  viewCount?: number;
  downloadCount?: number;
};

type ShareFile = {
  _id?: string;
  id?: string;
  fileName?: string;
  originalName?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  extension?: string;
};

type ShareSubfolder = {
  _id?: string;
  id?: string;
  name: string;
  description?: string | null;
};

type ShareResource = ShareFile & {
  files?: ShareFile[];
  subfolders?: ShareSubfolder[];
};

type FolderView = {
  folder: { id: string; name: string; description?: string | null; parentId?: string | null };
  breadcrumb: { id: string; name: string }[];
  subfolders: ShareSubfolder[];
  files: ShareFile[];
};

/* ─── Helpers ─── */

function fileDisplayName(file: ShareFile) {
  return file.originalName ?? file.fileName ?? file.name ?? "Shared file";
}

function fileExt(file: ShareFile) {
  const name = fileDisplayName(file);
  return file.extension ?? name.split(".").pop()?.toLowerCase() ?? "file";
}

function fileId(file: ShareFile) {
  return file.id ?? file._id ?? "";
}

function subfolderId(f: ShareSubfolder) {
  return f.id ?? f._id ?? "";
}

function ExtBadge({ ext }: { ext: string }) {
  return (
    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:bg-zinc-700 dark:text-gray-400">
      {ext}
    </span>
  );
}

function FileIcon({ file }: { file: ShareFile }) {
  const ext = fileExt(file);
  const mime = file.mimeType ?? "";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext))
    return <Image size={18} className="text-blue-500" />;
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm"].includes(ext))
    return <Video size={18} className="text-purple-500" />;
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac"].includes(ext))
    return <Music size={18} className="text-pink-500" />;
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext))
    return <Archive size={18} className="text-amber-500" />;
  if (["xls", "xlsx", "csv"].includes(ext))
    return <Table2 size={18} className="text-green-500" />;
  if (["js", "ts", "jsx", "tsx", "py", "go", "rs"].includes(ext))
    return <Code size={18} className="text-cyan-500" />;
  if (["pdf", "doc", "docx", "txt"].includes(ext))
    return <FileText size={18} className="text-red-500" />;
  return <File size={18} className="text-gray-400" />;
}

function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ─── Page ─── */

export default function PublicSharePage() {
  const params = useParams();
  const token = Array.isArray(params.token) ? params.token[0] : (params.token as string);

  const [share, setShare] = useState<ShareInfo | null>(null);
  const [resource, setResource] = useState<ShareResource | null>(null);
  const [folderView, setFolderView] = useState<FolderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [activePw, setActivePw] = useState<string | undefined>();
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isFolder = share?.resourceType === "folder";
  const canDownload = share?.permission === "download";

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const currentFiles = useMemo(() => {
    if (folderView) return folderView.files ?? [];
    if (isFolder) return resource?.files ?? [];
    return resource ? [resource] : [];
  }, [resource, folderView, isFolder]);

  const currentSubfolders = useMemo(() => {
    if (folderView) return folderView.subfolders ?? [];
    if (isFolder) return resource?.subfolders ?? [];
    return [];
  }, [resource, folderView, isFolder]);

  const breadcrumb = folderView?.breadcrumb ?? [];
  const totalSize = currentFiles.reduce((sum, f) => sum + (f.size ?? 0), 0);

  /* ─── Load root ─── */
  async function load(pw?: string) {
    if (!token || token === "undefined") {
      setError("Invalid share link.");
      setLoading(false);
      return;
    }

    try {
      const res = await sharesApi.accessViaToken(token, pw);
      const data = res.data?.data ?? res.data;
      setShare(data.share);
      setResource(data.resource);
      setFolderView(null);
      setError(null);
      if (pw) {
        setUnlocked(true);
        setActivePw(pw);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (status === 401 || status === 403) {
        setShare({
          shareToken: token,
          type: "link",
          resourceType: "file",
          permission: "download",
          isPasswordProtected: true,
        });
        if (pw) setPasswordError(message ?? "Incorrect password. Please try again.");
      } else if (status === 404) {
        setError("This share link is invalid or has been deleted.");
      } else if (status === 410) {
        setError("This share link has expired or has been revoked.");
      } else {
        setError(message ?? "Failed to load this share. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Unlock ─── */
  async function handleUnlock() {
    if (!password.trim()) return;
    setPasswordError("");
    setUnlocking(true);
    await load(password.trim());
    setUnlocking(false);
  }

  /* ─── Folder navigation ─── */
  async function navigateToFolder(folderId: string) {
    setNavigating(true);
    setDownloadError(null);
    try {
      const res = await sharesApi.accessViaTokenFolder(token, folderId, activePw);
      const data = res.data?.data ?? res.data;
      setFolderView(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDownloadError(msg ?? "Could not open folder.");
    } finally {
      setNavigating(false);
    }
  }

  function navigateToRoot() {
    setFolderView(null);
  }

  async function handleBreadcrumbClick(crumb: { id: string; name: string }, index: number) {
    if (index === 0) {
      navigateToRoot();
    } else {
      await navigateToFolder(crumb.id);
    }
  }

  /* ─── Download all ─── */
  async function handleDownloadAll() {
    if (!share || !canDownload) return;
    setDownloadingAll(true);
    setDownloadError(null);
    try {
      const res = await sharesApi.downloadViaToken(token, activePw);
      const data = res.data?.data ?? res.data;
      if (data.resourceType === "folder") {
        for (const file of data.files ?? []) {
          if (file.downloadUrl) triggerDownload(file.downloadUrl, file.fileName ?? "download");
        }
      } else if (data.downloadUrl) {
        triggerDownload(data.downloadUrl, data.fileName ?? fileDisplayName(resource ?? {}));
      }
    } catch (err: unknown) {
      setDownloadError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Failed to start download.",
      );
    } finally {
      setDownloadingAll(false);
    }
  }

  /* ─── Download single file ─── */
  async function handleFileDownload(f: ShareFile) {
    const id = fileId(f);
    if (!id || !canDownload) return;
    setDownloadingFileId(id);
    setDownloadError(null);
    try {
      const res = await sharesApi.downloadViaTokenFile(token, id, activePw);
      const data = res.data?.data ?? res.data;
      if (data.downloadUrl) triggerDownload(data.downloadUrl, fileDisplayName(f));
    } catch (err: unknown) {
      setDownloadError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Failed to download file.",
      );
    } finally {
      setDownloadingFileId(null);
    }
  }

  /* ─── Render: loading ─── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/25">
            <Send size={20} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={26} className="animate-spin text-orange-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading shared content…</p>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Render: fatal error ─── */
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-4 dark:bg-zinc-950">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/25">
          <Send size={18} />
        </div>
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-50 dark:bg-red-900/20">
            <XCircle size={36} className="text-red-400" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Share Unavailable</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          <p className="mt-6 text-xs text-gray-400">Powered by Jai Export Enterprises · Cloudflare R2</p>
        </div>
      </div>
    );
  }

  /* ─── Render: password gate ─── */
  if (share?.isPasswordProtected && !unlocked && !resource) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-orange-50 via-amber-50/40 to-white p-4 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <div className="w-full max-w-sm">
          {/* Brand */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/30">
              <Send size={20} />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500">Jai Export Enterprises</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Secure File Access</p>
          </div>

          <div className="overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-2xl shadow-gray-200/60 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
            <div className="h-1 w-full bg-linear-to-r from-orange-500 via-amber-400 to-orange-400" />
            <div className="px-7 py-8">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 dark:bg-orange-900/20">
                <Lock size={28} className="text-orange-500" />
              </div>
              <h1 className="mb-1 text-center text-xl font-extrabold text-gray-900 dark:text-white">Password Protected</h1>
              <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">This share requires a password to access.</p>
              <div className="relative mb-2">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                  placeholder="Enter password"
                  autoFocus
                  className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 pr-12 text-sm outline-none transition-all focus:border-orange-400 focus:bg-white focus:ring-3 focus:ring-orange-500/10 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {passwordError && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 dark:bg-red-900/20">
                  <AlertCircle size={13} className="shrink-0 text-red-500" />
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{passwordError}</p>
                </div>
              )}
              <button type="button" disabled={!password.trim() || unlocking} onClick={handleUnlock} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 font-bold text-white shadow-sm shadow-orange-500/25 transition-all hover:bg-orange-600 hover:shadow-md disabled:opacity-60">
                {unlocking ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                {unlocking ? "Unlocking…" : "Unlock Share"}
              </button>
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-gray-400 dark:text-gray-600">
            Files stored securely on Cloudflare R2
          </p>
        </div>
      </div>
    );
  }

  /* ─── Render: share content ─── */
  return (
    <div className="min-h-screen bg-linear-to-br from-orange-50/60 via-gray-50 to-white p-4 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="mx-auto max-w-2xl py-10">

        {/* Brand header */}
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/25">
            <Shield size={18} />
          </div>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-orange-500">Jai Export Enterprises</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">Secure File Access · Cloudflare R2</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-2xl shadow-gray-200/40 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
          <div className="h-1 w-full bg-linear-to-r from-orange-500 via-amber-400 to-orange-400" />

          {/* Header */}
          <div className="border-b border-gray-100 px-6 py-5 dark:border-zinc-800">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-md shadow-orange-500/20">
                {isFolder ? <Folder size={20} /> : <CheckCircle size={22} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-lg font-extrabold leading-tight text-gray-900 dark:text-white">
                    {share?.name ?? (isFolder ? (folderView?.folder.name ?? "Shared folder") : fileDisplayName(resource ?? {}))}
                  </h1>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    title="Copy link to clipboard"
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-all hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-400 dark:hover:border-orange-800 dark:hover:text-orange-400"
                  >
                    {copied ? <><Check size={12} className="text-emerald-500" /> Copied!</> : <><Copy size={12} /> Copy Link</>}
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                  {isFolder && (
                    <span className="flex items-center gap-1">
                      <Folder size={10} className="text-amber-500" />
                      {currentSubfolders.length} folder{currentSubfolders.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CloudUpload size={10} className="text-sky-500" />
                    {currentFiles.length} file{currentFiles.length !== 1 ? "s" : ""}
                  </span>
                  {totalSize > 0 && <span>{formatBytes(totalSize)}</span>}
                  {share?.isPasswordProtected && (
                    <span className="flex items-center gap-1 text-orange-500">
                      <Shield size={10} /> Protected
                    </span>
                  )}
                  <span className={`flex items-center gap-1 ${canDownload ? "text-emerald-500" : "text-gray-400"}`}>
                    <Shield size={10} />
                    {canDownload ? "Download enabled" : "View only"}
                  </span>
                  {share?.expiresAt && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> Expires {formatDate(share.expiresAt)}
                    </span>
                  )}
                  {(share?.viewCount ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Eye size={10} className="text-indigo-400" />
                      {share!.viewCount} view{share!.viewCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {share?.message && !folderView && (
              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-zinc-700/60 dark:bg-zinc-800/50">
                <p className="text-sm italic leading-relaxed text-gray-600 dark:text-gray-400">&ldquo;{share.message}&rdquo;</p>
              </div>
            )}
          </div>

          {/* Breadcrumb — only when inside a subfolder */}
          {isFolder && breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-100 px-5 py-2.5 dark:border-zinc-800">
              <button
                type="button"
                onClick={navigateToRoot}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-orange-500 transition-colors hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >
                <Folder size={11} /> Root
              </button>
              {breadcrumb.slice(1).map((crumb, idx) => (
                <span key={crumb.id} className="flex shrink-0 items-center gap-1">
                  <ChevronRight size={11} className="text-gray-300 dark:text-zinc-600" />
                  {idx === breadcrumb.length - 2 ? (
                    <span className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">{crumb.name}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleBreadcrumbClick(crumb, idx + 1)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-orange-500 transition-colors hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/20"
                    >
                      {crumb.name}
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Navigating spinner */}
          {navigating && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="animate-spin text-orange-400" />
            </div>
          )}

          {/* Content */}
          {!navigating && (
            <>
              {/* Subfolders */}
              {currentSubfolders.length > 0 && (
                <div className="divide-y divide-gray-100/80 border-b border-gray-100 dark:divide-zinc-800/60 dark:border-zinc-800">
                  {currentSubfolders.map((folder) => (
                    <button
                      key={subfolderId(folder)}
                      type="button"
                      onClick={() => navigateToFolder(subfolderId(folder))}
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-orange-50/60 dark:hover:bg-zinc-800/40"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
                        <Folder size={18} className="text-amber-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{folder.name}</p>
                        {folder.description && (
                          <p className="truncate text-xs text-gray-400">{folder.description}</p>
                        )}
                      </div>
                      <ChevronRight size={14} className="shrink-0 text-gray-300 dark:text-zinc-600" />
                    </button>
                  ))}
                </div>
              )}

              {/* Files */}
              <div className="divide-y divide-gray-100/80 dark:divide-zinc-800/60">
                {currentFiles.length === 0 && currentSubfolders.length === 0 && (
                  <div className="px-5 py-14 text-center">
                    <Folder size={36} className="mx-auto mb-3 text-gray-200 dark:text-zinc-700" />
                    <p className="text-sm font-medium text-gray-400 dark:text-zinc-500">This folder is empty.</p>
                  </div>
                )}
                {currentFiles.map((file, index) => {
                  const id = fileId(file);
                  const isDownloadingThis = downloadingFileId === id;
                  return (
                    <div key={id || index} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/40">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-zinc-800">
                        <FileIcon file={file} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{fileDisplayName(file)}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <p className="text-xs text-gray-500">{formatBytes(file.size ?? 0)}</p>
                          <ExtBadge ext={fileExt(file)} />
                        </div>
                      </div>
                      {canDownload && id && (
                        <button
                          type="button"
                          disabled={isDownloadingThis}
                          onClick={() => handleFileDownload(file)}
                          title="Download this file"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 transition-all hover:bg-orange-500 hover:text-white disabled:opacity-50 dark:bg-orange-900/20 dark:hover:bg-orange-500"
                        >
                          {isDownloadingThis
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Download size={14} />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Download error */}
          {downloadError && (
            <div className="flex items-center gap-3 border-t border-red-100 bg-red-50 px-5 py-3 dark:border-red-900/20 dark:bg-red-900/10">
              <AlertCircle size={13} className="shrink-0 text-red-500" />
              <p className="flex-1 text-xs font-medium text-red-600 dark:text-red-400">{downloadError}</p>
              <button type="button" aria-label="Dismiss error" onClick={() => setDownloadError(null)} className="text-red-400 hover:text-red-600">
                <XCircle size={13} />
              </button>
            </div>
          )}

          {/* Download all / view-only footer */}
          <div className="border-t border-gray-100 p-5 dark:border-zinc-800">
            {canDownload ? (
              <button
                type="button"
                disabled={downloadingAll}
                onClick={handleDownloadAll}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-orange-500 font-bold text-white shadow-md shadow-orange-500/20 transition-all hover:bg-orange-600 hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-60"
              >
                {downloadingAll
                  ? <><Loader2 size={16} className="animate-spin" /> Preparing…</>
                  : <><Download size={16} /> {isFolder ? `Download All Files · ${formatBytes(totalSize)}` : "Download"}</>}
              </button>
            ) : (
              <div className="flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                <Eye size={15} />
                View only — downloading is not permitted
              </div>
            )}
          </div>
        </div>

        {/* Security footer */}
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-400 dark:text-gray-600">
          <span className="flex items-center gap-1">
            <Shield size={11} className="text-emerald-500" /> Secure storage
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <CloudUpload size={11} className="text-sky-500" /> Cloudflare R2
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Sparkles size={11} className="text-orange-400" /> Jai Export Enterprises
          </span>
        </div>
      </div>
    </div>
  );
}
