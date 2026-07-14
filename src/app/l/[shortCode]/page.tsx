"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Download, Lock, Folder, FolderOpen, ChevronRight, Home,
  Loader2, Shield, AlertTriangle, XCircle, Clock,
  Eye, EyeOff, AlertCircle, Send, Sparkles, CloudUpload,
  File, Image, FileText, Music, Video, Archive, Table2, Code, X,
  Copy, Check,
} from "lucide-react";
import { formatBytes, formatDate } from "@/lib/utils";
import { BASE_URL } from "@/lib/api";
import axios from "axios";
import type { PublicLinkView, PublicFolderContents, PublicLinkFolder } from "@/types";

/* ──────────────────────────────────────────
   Helpers
────────────────────────────────────────── */
function FileIcon({ ext, size = 18 }: { ext: string; size?: number }) {
  const e = ext.toLowerCase();
  if (["pdf"].includes(e))                                       return <FileText size={size} className="text-red-500" />;
  if (["jpg","jpeg","png","gif","svg","webp","bmp"].includes(e)) return <Image    size={size} className="text-blue-500" />;
  if (["mp4","mov","avi","mkv","webm"].includes(e))              return <Video    size={size} className="text-purple-500" />;
  if (["mp3","wav","ogg","flac","aac"].includes(e))              return <Music    size={size} className="text-pink-500" />;
  if (["zip","tar","gz","rar","7z"].includes(e))                 return <Archive  size={size} className="text-amber-500" />;
  if (["xls","xlsx","csv"].includes(e))                          return <Table2   size={size} className="text-green-500" />;
  if (["doc","docx"].includes(e))                                return <FileText size={size} className="text-blue-600" />;
  if (["js","ts","jsx","tsx","py","rb","go","rs"].includes(e))   return <Code     size={size} className="text-cyan-500" />;
  return <File size={size} className="text-gray-400" />;
}

function ExtBadge({ ext }: { ext: string }) {
  return (
    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:bg-zinc-700 dark:text-gray-400">
      {ext}
    </span>
  );
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ──────────────────────────────────────────
   PAGE
────────────────────────────────────────── */
export default function PublicLinkPage() {
  const params    = useParams();
  const router    = useRouter();
  const shortCode = Array.isArray(params.shortCode)
    ? params.shortCode[0]
    : (params.shortCode as string);

  const isInvalid = !shortCode || shortCode === "undefined";

  const [rootData,      setRootData]      = useState<PublicLinkView | null>(null);
  const [folderView,    setFolderView]    = useState<PublicFolderContents | null>(null);
  const [loading,       setLoading]       = useState(!isInvalid);
  const [folderLoading, setFolderLoading] = useState(false);
  const [error,         setError]         = useState<string | null>(isInvalid ? "Invalid link." : null);
  const [password,      setPassword]      = useState("");
  const [showPw,        setShowPw]        = useState(false);
  const [pwError,       setPwError]       = useState("");
  const [unlocking,     setUnlocking]     = useState(false);
  const [unlocked,      setUnlocked]      = useState(false);
  const [activePw,      setActivePw]      = useState("");
  const [downloading,   setDownloading]   = useState<string | null>(null);
  const [dlError,       setDlError]       = useState<string | null>(null);
  const [copied,        setCopied]        = useState(false);

  const [mountedAt] = useState(Date.now);

  /* ── Copy link ── */
  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* ── Initial fetch ── */
  useEffect(() => {
    if (isInvalid) return;

    axios
      .get(`${BASE_URL}/links/l/${shortCode}`, { withCredentials: true })
      .then((res) => {
        const data: PublicLinkView = res.data?.data ?? res.data;
        if (data.type === "transfer") {
          router.replace(`/t/${shortCode}`);
          return;
        }
        setRootData(data);
        if (!data.link.hasPassword) setUnlocked(true);
        setLoading(false);
      })
      .catch((err) => {
        const status = err?.response?.status;
        const msg    = String(err?.response?.data?.message ?? "");
        const normalizedMessage = msg.toLowerCase();
        if (status === 404) {
          setError("This link is invalid or has been deleted.");
        } else if ((status === 403 || status === 410) && normalizedMessage.includes("expired")) {
          setError("This link has expired and is no longer available.");
        } else if (status === 403 && normalizedMessage.includes("disabled")) {
          setError("This link has been disabled by the owner.");
        } else if (status === 403 && (normalizedMessage.includes("password") || normalizedMessage.includes("protected"))) {
          setRootData({
            link: {
              id: "", shortCode, url: "", type: "share",
              status: "active", permission: "download", privacy: "public",
              hasPassword: true, fileCount: 0, totalSize: 0,
              views: 0, downloads: 0, createdAt: "",
            },
            type: "share",
            files: [],
            folders: [],
          });
        } else {
          setError(msg || "Failed to load this link. Please try again.");
        }
        setLoading(false);
      });
  }, [shortCode, isInvalid, router]);

  /* ── Password unlock ── */
  async function handleUnlock() {
    if (!password.trim()) return;
    setPwError("");
    setUnlocking(true);
    try {
      const res = await axios.get(`${BASE_URL}/links/l/${shortCode}`, {
        params: { password: password.trim() },
        withCredentials: true,
      });
      const data: PublicLinkView = res.data?.data ?? res.data;
      if (data.type === "transfer") {
        router.replace(`/t/${shortCode}`);
        return;
      }
      setRootData(data);
      setActivePw(password.trim());
      setUnlocked(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg    = String((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "");
      const normalizedMessage = msg.toLowerCase();
      if (status === 410 || normalizedMessage.includes("expired")) {
        setError("This link has expired and is no longer available.");
      } else if (normalizedMessage.includes("disabled")) {
        setError("This link has been disabled by the owner.");
      } else if (status === 403) setPwError(msg || "Incorrect password. Please try again.");
      else setPwError("Something went wrong. Please try again.");
    } finally {
      setUnlocking(false);
    }
  }

  /* ── Folder navigation ── */
  async function navigateToFolder(folder: PublicLinkFolder | { id: string; name: string }) {
    setFolderLoading(true);
    setDlError(null);
    try {
      const res = await axios.get(
        `${BASE_URL}/links/l/${shortCode}/folder/${folder.id}`,
        { params: activePw ? { password: activePw } : {}, withCredentials: true },
      );
      const data: PublicFolderContents = res.data?.data ?? res.data;
      setFolderView(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDlError(msg ?? "Failed to load folder contents.");
    } finally {
      setFolderLoading(false);
    }
  }

  function navigateToRoot() {
    setFolderView(null);
    setDlError(null);
  }

  async function navigateToBreadcrumb(item: { id: string; name: string }) {
    await navigateToFolder(item);
  }

  /* ── File download ── */
  async function handleDownload(fileId: string, fileName: string) {
    setDownloading(fileId);
    setDlError(null);
    try {
      const res = await axios.get(
        `${BASE_URL}/links/l/${shortCode}/file/${fileId}/download`,
        { params: activePw ? { password: activePw } : {}, withCredentials: true },
      );
      const url = res.data?.data?.downloadUrl ?? res.data?.downloadUrl;
      if (!url) throw new Error("No download URL returned");
      triggerDownload(url, fileName);
    } catch {
      setDlError("Failed to start download. Please try again.");
    } finally {
      setDownloading(null);
    }
  }

  /* ── Derived ── */
  const link        = rootData?.link;
  const daysLeft    = link?.expiresAt
    ? Math.ceil((new Date(link.expiresAt).getTime() - mountedAt) / 86_400_000)
    : null;
  const isExpired   = link?.status === "expired"  || (daysLeft !== null && daysLeft < 0);
  const isDisabled  = link?.status === "disabled";
  const canDownload = link?.permission === "download" && !isExpired && !isDisabled;

  const displayFolders = folderView?.subfolders ?? rootData?.folders ?? [];
  const displayFiles   = folderView?.files      ?? rootData?.files   ?? [];
  const breadcrumb     = folderView?.breadcrumb ?? [];

  /* ════════════════════════════════════════
     STATES
  ════════════════════════════════════════ */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/25">
            <Send size={20} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={26} className="animate-spin text-orange-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading shared files…</p>
          </div>
        </div>
      </div>
    );
  }

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
          <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Link Unavailable</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          <p className="mt-6 text-xs text-gray-400">Powered by Jai Export Enterprises · Cloudflare R2</p>
        </div>
      </div>
    );
  }

  /* ── Password gate ── */
  if (link?.hasPassword && !unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-orange-50 via-amber-50/40 to-white p-4 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/30">
              <Send size={20} />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500">Jai Export Enterprises</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Secure File Share</p>
          </div>

          <div className="overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-1 w-full bg-linear-to-r from-orange-500 via-amber-400 to-orange-400" />
            <div className="px-7 py-8">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 dark:bg-orange-900/20">
                <Lock size={28} className="text-orange-500" />
              </div>
              <h1 className="mb-1 text-center text-xl font-extrabold text-gray-900 dark:text-white">Password Protected</h1>
              <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
                This shared link requires a password to access.
              </p>
              <div className="relative mb-2">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPwError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                  placeholder="Enter password"
                  autoFocus
                  className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 pr-12 text-sm outline-none transition-all focus:border-orange-400 focus:bg-white focus:ring-3 focus:ring-orange-500/10 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <button type="button" onClick={() => setShowPw((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {pwError && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 dark:bg-red-900/20">
                  <AlertCircle size={13} className="shrink-0 text-red-500" />
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{pwError}</p>
                </div>
              )}
              <button type="button" disabled={!password.trim() || unlocking} onClick={handleUnlock}
                className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 font-bold text-white shadow-sm shadow-orange-500/25 transition-all hover:bg-orange-600 hover:shadow-md disabled:opacity-60">
                {unlocking ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                {unlocking ? "Unlocking…" : "Unlock"}
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

  if (!rootData) return null;

  /* ════════════════════════════════════════
     MAIN VIEW
  ════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-linear-to-br from-orange-50/60 via-gray-50 to-white p-4 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="mx-auto max-w-2xl py-10">

        {/* Brand header */}
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/25">
            <Send size={18} />
          </div>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-orange-500">Jai Export Enterprises</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">Secure File Share · Cloudflare R2</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-2xl shadow-gray-200/40 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">

          {/* Top accent */}
          <div className="h-1 w-full bg-linear-to-r from-orange-500 via-amber-400 to-orange-400" />

          {/* Status banners */}
          {isExpired && (
            <div className="flex items-center gap-3 border-b border-red-100 bg-red-50 px-5 py-3 dark:border-red-900/20 dark:bg-red-900/10">
              <Clock size={14} className="shrink-0 text-red-500" />
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">This link has expired</p>
            </div>
          )}
          {isDisabled && (
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-100 px-5 py-3 dark:border-zinc-700 dark:bg-zinc-800">
              <XCircle size={14} className="shrink-0 text-gray-500" />
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">This link has been disabled</p>
            </div>
          )}
          {canDownload && daysLeft !== null && daysLeft <= 2 && daysLeft >= 0 && (
            <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 dark:border-amber-900/30 dark:bg-amber-900/10">
              <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Expires {daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
              </p>
            </div>
          )}

          {/* Header */}
          <div className="border-b border-gray-100 px-6 py-5 dark:border-zinc-800">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-md shadow-orange-500/20">
                <FolderOpen size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="text-lg font-extrabold leading-tight text-gray-900 dark:text-white">
                    Shared Files
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
                  <span className="flex items-center gap-1">
                    <CloudUpload size={10} className="text-sky-500" />
                    {link?.fileCount ?? 0} file{(link?.fileCount ?? 0) !== 1 ? "s" : ""}
                    {(link?.totalSize ?? 0) > 0 && <> · {formatBytes(link!.totalSize)}</>}
                  </span>
                  {(link?.views ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Eye size={10} className="text-indigo-400" />
                      {link!.views} view{link!.views !== 1 ? "s" : ""}
                    </span>
                  )}
                  {link?.hasPassword && (
                    <span className="flex items-center gap-1 text-orange-500">
                      <Shield size={10} /> Protected
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-emerald-500">
                    <Shield size={10} /> {link?.permission === "download" ? "Download enabled" : "View only"}
                  </span>
                  {canDownload && daysLeft !== null && daysLeft > 2 && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> {daysLeft}d left
                    </span>
                  )}
                  {link?.expiresAt && (daysLeft === null || daysLeft > 2) && !isExpired && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> Expires {formatDate(link.expiresAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Breadcrumb */}
          {(folderView || breadcrumb.length > 0) && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-100 px-5 py-2 dark:border-zinc-800">
              <button
                type="button"
                onClick={navigateToRoot}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-orange-500 dark:hover:bg-zinc-800"
              >
                <Home size={11} /> Root
              </button>
              {breadcrumb.map((crumb, i) => (
                <span key={crumb.id} className="flex shrink-0 items-center gap-1">
                  <ChevronRight size={11} className="text-gray-300 dark:text-zinc-600" />
                  <button
                    type="button"
                    onClick={() => i < breadcrumb.length - 1 && navigateToBreadcrumb(crumb)}
                    className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                      i === breadcrumb.length - 1
                        ? "text-orange-500"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Folder loading spinner */}
          {folderLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="animate-spin text-orange-500" />
            </div>
          )}

          {/* Content */}
          {!folderLoading && (
            <div className="divide-y divide-gray-100/80 dark:divide-zinc-800/60">

              {/* Folders */}
              {displayFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => navigateToFolder(folder)}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-orange-50/40 dark:hover:bg-orange-500/5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/20">
                    <Folder size={18} className="text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{folder.name}</p>
                    <p className="text-xs text-gray-500">
                      {folder.fileCount} file{folder.fileCount !== 1 ? "s" : ""}
                      {folder.subfolderCount > 0 && ` · ${folder.subfolderCount} folder${folder.subfolderCount !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <ChevronRight size={14} className="shrink-0 text-gray-300 dark:text-zinc-600" />
                </button>
              ))}

              {/* Files */}
              {displayFiles.map((file) => (
                <div key={file.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/40">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-zinc-800">
                    <FileIcon ext={file.extension} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{file.name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                      <ExtBadge ext={file.extension} />
                    </div>
                  </div>
                  {canDownload && (
                    <button
                      type="button"
                      disabled={downloading === file.id}
                      onClick={() => handleDownload(file.id, file.name)}
                      title={`Download ${file.name}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 transition-all hover:bg-orange-500 hover:text-white disabled:opacity-60 dark:bg-orange-900/20 dark:hover:bg-orange-500"
                    >
                      {downloading === file.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Download size={14} />}
                    </button>
                  )}
                </div>
              ))}

              {/* Empty state */}
              {displayFolders.length === 0 && displayFiles.length === 0 && (
                <div className="px-5 py-14 text-center">
                  <FolderOpen size={36} className="mx-auto mb-3 text-gray-200 dark:text-zinc-700" />
                  <p className="text-sm font-medium text-gray-400 dark:text-zinc-500">This folder is empty</p>
                </div>
              )}
            </div>
          )}

          {/* Download error */}
          {dlError && (
            <div className="flex items-center gap-3 border-t border-red-100 bg-red-50 px-5 py-3 dark:border-red-900/20 dark:bg-red-900/10">
              <AlertCircle size={14} className="shrink-0 text-red-500" />
              <p className="flex-1 text-sm font-medium text-red-600 dark:text-red-400">{dlError}</p>
              <button type="button" aria-label="Dismiss" onClick={() => setDlError(null)}
                className="shrink-0 text-red-400 hover:text-red-600">
                <X size={14} />
              </button>
            </div>
          )}

          {/* View-only notice */}
          {!canDownload && !isExpired && !isDisabled && (
            <div className="border-t border-gray-100 px-5 py-4 text-center dark:border-zinc-800">
              <p className="text-sm text-gray-400">This link is set to view only — downloads are not available.</p>
            </div>
          )}
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
