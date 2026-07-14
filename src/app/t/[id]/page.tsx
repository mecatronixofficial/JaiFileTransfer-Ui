"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import NextImage from "next/image";
import {
  Download, Lock, FileText, Image as ImageIcon, Video, Archive, Music, Code,
  Table2, File, Clock, CheckCircle, XCircle, Eye, EyeOff,
  AlertTriangle, Loader2, Shield, Folder, FolderOpen,
  ChevronDown, ChevronRight, CloudUpload, Send, Sparkles,
  AlertCircle, X, Copy, Check, User as UserIcon,
} from "lucide-react";
import { formatBytes, formatDate, getInitials } from "@/lib/utils";
import { BASE_URL } from "@/lib/api";
import ImgHelper from "@/helper/img_helper";
import axios from "axios";

/* ──────────────────────────────────────────
   Types
────────────────────────────────────────── */
interface TransferFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  extension: string;
  relativePath?: string;
  downloadUrl?: string;
}

interface PublicTransfer {
  id: string;
  title?: string;
  subject?: string;
  message?: string;
  files: TransferFile[];
  totalSize: number;
  fileCount: number;
  hasPassword: boolean;
  expiresAt?: string;
  status: "active" | "expired" | "disabled";
  senderName?: string;
  senderEmail?: string;
}

interface FolderNode {
  name: string;
  path: string;
  files: TransferFile[];
  children: Record<string, FolderNode>;
}

function BrandHeader() {
  return (
    <div className="flex w-full items-center justify-between gap-4 rounded-2xl border border-orange-100/80 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/75 sm:px-5 sm:py-4">
      <div className="min-w-0 text-left">
        <p className="truncate text-sm font-extrabold uppercase tracking-[0.16em] text-orange-500 sm:text-base sm:tracking-[0.2em]">
          Jai Export Enterprises
        </p>
        <p className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-gray-500 sm:text-xs">
          Secure File Transfer · Cloudflare R2
        </p>
      </div>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-orange-500/15 to-amber-400/10 ring-1 ring-orange-400/30 sm:h-14 sm:w-14 sm:rounded-2xl">
        <NextImage
          src={ImgHelper.logo.jai_logo}
          alt="Jai Export Enterprises company logo"
          width={44}
          height={44}
          priority
          className="h-8 w-8 object-contain sm:h-10 sm:w-10"
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   File icon
────────────────────────────────────────── */
function FileIcon({ ext, size = 18 }: { ext: string; size?: number }) {
  const e = ext.toLowerCase();
  if (["pdf"].includes(e))                                   return <FileText size={size} className="text-red-500" />;
  if (["jpg","jpeg","png","gif","svg","webp","bmp"].includes(e)) return <ImageIcon size={size} className="text-blue-500" />;
  if (["mp4","mov","avi","mkv","webm"].includes(e))          return <Video    size={size} className="text-purple-500" />;
  if (["mp3","wav","ogg","flac","aac"].includes(e))          return <Music    size={size} className="text-pink-500" />;
  if (["zip","tar","gz","rar","7z"].includes(e))             return <Archive  size={size} className="text-amber-500" />;
  if (["xls","xlsx","csv"].includes(e))                      return <Table2   size={size} className="text-green-500" />;
  if (["doc","docx"].includes(e))                            return <FileText size={size} className="text-blue-600" />;
  if (["js","ts","jsx","tsx","py","rb","go","rs"].includes(e))return <Code    size={size} className="text-cyan-500" />;
  return <File size={size} className="text-gray-400" />;
}

function ExtBadge({ ext }: { ext: string }) {
  return (
    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:bg-zinc-700 dark:text-gray-400">
      {ext}
    </span>
  );
}

/* ──────────────────────────────────────────
   Build folder tree from flat file list
────────────────────────────────────────── */
function buildFolderTree(files: TransferFile[]): { rootFiles: TransferFile[]; folders: FolderNode[] } {
  const rootFiles: TransferFile[] = [];
  const folderMap: Record<string, FolderNode> = {};

  for (const file of files) {
    const rel = file.relativePath ?? file.name;
    const parts = rel.split("/");

    if (parts.length === 1) {
      rootFiles.push(file);
      continue;
    }

    const folderName = parts[0];
    if (!folderMap[folderName]) {
      folderMap[folderName] = { name: folderName, path: folderName, files: [], children: {} };
    }

    let node = folderMap[folderName];
    for (let i = 1; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.children[seg]) {
        node.children[seg] = { name: seg, path: `${node.path}/${seg}`, files: [], children: {} };
      }
      node = node.children[seg];
    }
    node.files.push(file);
  }

  return {
    rootFiles,
    folders: Object.values(folderMap).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function countFiles(node: FolderNode): number {
  return node.files.length + Object.values(node.children).reduce((s, c) => s + countFiles(c), 0);
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

const FOLDER_PL = [
  "pl-2 sm:pl-5",
  "pl-4 sm:pl-9",
  "pl-6 sm:pl-12",
  "pl-8 sm:pl-16",
  "pl-10 sm:pl-20",
] as const;
const FILE_PL = [
  "pl-2 sm:pl-5",
  "pl-4 sm:pl-8",
  "pl-6 sm:pl-12",
  "pl-8 sm:pl-16",
  "pl-10 sm:pl-20",
] as const;
function folderPl(depth: number) { return FOLDER_PL[Math.min(depth, FOLDER_PL.length - 1)]; }
function filePl(depth: number)   { return FILE_PL[Math.min(depth, FILE_PL.length - 1)]; }

/* ──────────────────────────────────────────
   Folder row (recursive)
────────────────────────────────────────── */
function FolderRow({
  node, depth = 0, password, shortId, unlocked, downloading, onDownload, canDownload,
}: {
  node: FolderNode;
  depth?: number;
  password: string;
  shortId: string;
  unlocked: boolean;
  downloading: string | null;
  onDownload: (id: string, name: string) => void;
  canDownload: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [downloadingFolder, setDownloadingFolder] = useState(false);
  const subFolders = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
  const totalFiles = countFiles(node);

  async function handleFolderDownload(e: React.MouseEvent) {
    e.stopPropagation();
    setDownloadingFolder(true);
    try {
      const params = new URLSearchParams();
      params.set("folder", node.path);
      if (unlocked && password) params.set("password", password);
      triggerDownload(
        `${BASE_URL}/transfers/t/${shortId}/download?${params.toString()}`,
        `${node.name}.zip`,
      );
    } finally {
      setTimeout(() => setDownloadingFolder(false), 1500);
    }
  }

  return (
    <div>
      <div className={`flex w-full items-center gap-1.5 py-2.5 pr-2 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/60 sm:gap-2 sm:pr-3 ${folderPl(depth)}`}>
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left sm:gap-2"
        >
          {open
            ? <ChevronDown size={12} className="shrink-0 text-gray-400" />
            : <ChevronRight size={12} className="shrink-0 text-gray-400" />}
          {open
            ? <FolderOpen size={15} className="shrink-0 text-amber-500" />
            : <Folder size={15} className="shrink-0 text-amber-500" />}
          <span className="flex-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-200">{node.name}</span>
          <span className="mr-1 hidden shrink-0 text-[11px] text-gray-400 sm:inline">
            {totalFiles} file{totalFiles !== 1 ? "s" : ""}
          </span>
        </button>
        {canDownload && (
          <button
            type="button"
            disabled={downloadingFolder}
            onClick={handleFolderDownload}
            title={`Download ${node.name} as ZIP`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 transition-all hover:bg-orange-500 hover:text-white disabled:opacity-60 dark:bg-orange-900/20 dark:hover:bg-orange-500 sm:h-8 sm:w-8"
          >
            {downloadingFolder
              ? <Loader2 size={12} className="animate-spin" />
              : <Download size={12} />}
          </button>
        )}
      </div>

      {open && (
        <div>
          {subFolders.map((child) => (
            <FolderRow
              key={child.path}
              node={child}
              depth={depth + 1}
              password={password}
              shortId={shortId}
              unlocked={unlocked}
              downloading={downloading}
              onDownload={onDownload}
              canDownload={canDownload}
            />
          ))}
          {node.files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              depth={depth + 1}
              downloading={downloading}
              onDownload={onDownload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────
   File row
────────────────────────────────────────── */
function FileRow({
  file, depth = 0, downloading, onDownload,
}: {
  file: TransferFile;
  depth?: number;
  downloading: string | null;
  onDownload: (id: string, name: string) => void;
}) {
  return (
    <div
      className={`flex items-start gap-2 border-b border-gray-100/80 py-3 pr-2 transition-colors last:border-0 hover:bg-gray-50/60 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40 sm:gap-3 sm:pr-5 ${filePl(depth)}`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 sm:h-9 sm:w-9 sm:rounded-xl">
        <FileIcon ext={file.extension} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-all text-sm font-semibold leading-snug text-gray-900 dark:text-white">{file.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
          <ExtBadge ext={file.extension} />
        </div>
      </div>
      <button
        type="button"
        disabled={downloading === file.id}
        onClick={() => onDownload(file.id, file.name)}
        title={`Download ${file.name}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 transition-all hover:bg-orange-500 hover:text-white disabled:opacity-60 dark:bg-orange-900/20 dark:hover:bg-orange-500 sm:h-8 sm:w-8"
      >
        {downloading === file.id
          ? <Loader2 size={14} className="animate-spin" />
          : <Download size={14} />}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   PAGE
══════════════════════════════════════════ */
export default function PublicTransferPage() {
  const params  = useParams();
  const shortId = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const isInvalidId = !shortId || shortId === "undefined";

  const [transfer, setTransfer]             = useState<PublicTransfer | null>(null);
  const [loading,  setLoading]              = useState(!isInvalidId);
  const [error,    setError]                = useState<string | null>(isInvalidId ? "Invalid transfer link." : null);
  const [password, setPassword]             = useState("");
  const [showPassword, setShowPassword]     = useState(false);
  const [passwordError, setPasswordError]   = useState("");
  const [unlocking, setUnlocking]           = useState(false);
  const [unlocked,  setUnlocked]            = useState(false);
  const [downloading,    setDownloading]    = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadError,  setDownloadError]  = useState<string | null>(null);
  const [copied,         setCopied]         = useState(false);

  const [mountedAt] = useState(Date.now);

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* ── Initial fetch ── */
  useEffect(() => {
    if (isInvalidId) return;

    axios.get(`${BASE_URL}/transfers/t/${shortId}`, { withCredentials: true })
      .then((res) => {
        const data = res.data?.data ?? res.data;
        setTransfer(data);
        setLoading(false);
      })
      .catch((err) => {
        const status = err?.response?.status;
        const msg    = String(err?.response?.data?.message ?? "");
        const normalizedMessage = msg.toLowerCase();
        if (status === 404)       setError("This transfer link is invalid or has been deleted.");
        else if (status === 410 || normalizedMessage.includes("expired")) {
          setError("This transfer has expired and is no longer available.");
        } else if (normalizedMessage.includes("disabled")) {
          setError("This transfer link has been disabled by the owner.");
        } else if (
          (status === 401 || status === 403) &&
          (normalizedMessage.includes("password") || normalizedMessage.includes("protected"))
        ) {
          setTransfer({ id: shortId, files: [], totalSize: 0, fileCount: 0, hasPassword: true, status: "active" });
        } else setError(msg || "Failed to load this transfer. Please try again.");
        setLoading(false);
      });
  }, [shortId, isInvalidId]);

  /* ── Password unlock ── */
  async function handleUnlock() {
    if (!password.trim()) return;
    setPasswordError("");
    setUnlocking(true);
    try {
      const res  = await axios.get(`${BASE_URL}/transfers/t/${shortId}`, {
        params: { password: password.trim() },
        withCredentials: true,
      });
      const data = res.data?.data ?? res.data;
      setTransfer(data);
      setUnlocked(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg    = String((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "");
      const normalizedMessage = msg.toLowerCase();
      if (status === 410 || normalizedMessage.includes("expired")) {
        setError("This transfer has expired and is no longer available.");
      } else if (normalizedMessage.includes("disabled")) {
        setError("This transfer link has been disabled by the owner.");
      } else if (status === 401 || status === 403)
        setPasswordError(msg || "Incorrect password. Please try again.");
      else
        setPasswordError("Something went wrong. Please try again.");
    } finally {
      setUnlocking(false);
    }
  }

  /* ── Individual file download ── */
  async function handleDownload(fileId: string, fileName: string) {
    try {
      setDownloading(fileId);
      const res = await axios.get(`${BASE_URL}/transfers/t/${shortId}/files/${fileId}/download`, {
        params: unlocked && password ? { password } : undefined,
        withCredentials: true,
      });
      const url = res.data?.data?.downloadUrl ?? res.data?.downloadUrl ?? res.data?.url;
      if (!url) throw new Error("No download URL returned");
      triggerDownload(url, fileName);
    } catch {
      setDownloadError("Failed to start download. Please try again.");
    } finally {
      setDownloading(null);
    }
  }

  /* ── Download all as ZIP ── */
  async function handleDownloadAll() {
    if (!transfer) return;
    setDownloadingAll(true);
    try {
      const params = new URLSearchParams();
      if (unlocked && password) params.set("password", password);
      const qs  = params.toString();
      const url = `${BASE_URL}/transfers/t/${shortId}/download${qs ? `?${qs}` : ""}`;
      triggerDownload(url, `${transfer.title ?? "transfer"}.zip`);
    } catch {
      for (const f of transfer.files) {
        await handleDownload(f.id, f.name);
      }
    } finally {
      setDownloadingAll(false);
    }
  }

  /* ── Derived ── */
  const daysLeft = transfer?.expiresAt
    ? Math.ceil((new Date(transfer.expiresAt).getTime() - mountedAt) / 86_400_000)
    : null;

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/25">
            <Send size={20} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={26} className="animate-spin text-orange-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading transfer…</p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Hard error ── */
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
          <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Transfer Unavailable</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          <p className="mt-6 text-xs text-gray-400">Powered by Jai Export Enterprises · Cloudflare R2</p>
        </div>
      </div>
    );
  }

  /* ── Password gate ── */
  if (transfer?.hasPassword && !unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-orange-50 via-amber-50/40 to-white p-3 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 sm:p-4">
        <div className="w-full max-w-sm">
          <div className="mb-5 sm:mb-7"><BrandHeader /></div>

          <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl shadow-gray-200/60 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none sm:rounded-3xl">
            <div className="h-1 w-full bg-linear-to-r from-orange-500 via-amber-400 to-orange-400" />
            <div className="px-5 py-6 sm:px-7 sm:py-8">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 dark:bg-orange-900/20">
                <Lock size={28} className="text-orange-500" />
              </div>
              <h1 className="mb-1 text-center text-xl font-extrabold text-gray-900 dark:text-white">Password Protected</h1>
              <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
                This transfer requires a password to access.
              </p>

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
                <button type="button" onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {passwordError && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 dark:bg-red-900/20">
                  <AlertCircle size={13} className="shrink-0 text-red-500" />
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{passwordError}</p>
                </div>
              )}

              <button type="button" disabled={!password.trim() || unlocking} onClick={handleUnlock}
                className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 font-bold text-white shadow-sm shadow-orange-500/25 transition-all hover:bg-orange-600 hover:shadow-md disabled:opacity-60">
                {unlocking ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                {unlocking ? "Unlocking…" : "Unlock Transfer"}
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

  if (!transfer) return null;

  const isExpired  = transfer.status === "expired"  || (daysLeft !== null && daysLeft < 0);
  const isDisabled = transfer.status === "disabled";
  const canDownload = !isExpired && !isDisabled;

  const { rootFiles, folders } = buildFolderTree(transfer.files ?? []);
  const hasFolders = folders.length > 0;

  const senderInitials = getInitials(transfer.senderName ?? transfer.senderEmail);

  /* ══════════════════════════════════════════
     MAIN PUBLIC TRANSFER PAGE
  ══════════════════════════════════════════ */
  return (
    <div className="min-h-screen overflow-x-hidden bg-linear-to-br from-orange-50/60 via-gray-50 to-white p-3 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 sm:p-5 lg:p-8">
      <div className="mx-auto max-w-2xl py-5 sm:py-8 lg:py-10">

        {/* Brand header */}
        <div className="mb-5 sm:mb-7"><BrandHeader /></div>

        {/* Main card */}
        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl shadow-gray-200/40 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none sm:rounded-3xl">

          {/* Top accent */}
          <div className="h-1 w-full bg-linear-to-r from-orange-500 via-amber-400 to-orange-400" />

          {/* Status banners */}
          {isExpired && (
            <div className="flex items-center gap-2.5 border-b border-red-100 bg-red-50 px-4 py-3 dark:border-red-900/20 dark:bg-red-900/10 sm:gap-3 sm:px-5">
              <Clock size={14} className="shrink-0 text-red-500" />
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 sm:text-sm">This transfer has expired</p>
            </div>
          )}
          {isDisabled && (
            <div className="flex items-center gap-2.5 border-b border-gray-200 bg-gray-100 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800 sm:gap-3 sm:px-5">
              <XCircle size={14} className="shrink-0 text-gray-500" />
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 sm:text-sm">This transfer has been disabled by the sender</p>
            </div>
          )}
          {canDownload && daysLeft !== null && daysLeft <= 2 && (
            <div className="flex items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-900/10 sm:gap-3 sm:px-5">
              <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 sm:text-sm">
                Expires {daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
              </p>
            </div>
          )}

          {/* Transfer header */}
          <div className="border-b border-gray-100 px-4 py-4 dark:border-zinc-800 sm:px-6 sm:py-5">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-md shadow-orange-500/20 sm:h-12 sm:w-12 sm:rounded-2xl">
                <CheckCircle size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <h1 className="break-words text-base font-extrabold leading-tight text-gray-900 dark:text-white sm:text-lg">
                    {transfer.subject ?? transfer.title ?? "Files for you"}
                  </h1>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    title="Copy link to clipboard"
                    className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 transition-all hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-400 dark:hover:border-orange-800 dark:hover:text-orange-400 sm:w-auto sm:py-1.5"
                  >
                    {copied ? <><Check size={12} className="text-emerald-500" /> Copied!</> : <><Copy size={12} /> Copy Link</>}
                  </button>
                </div>

                {/* Sender info */}
                {(transfer.senderName || transfer.senderEmail) && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                      {senderInitials !== "?" ? senderInitials : <UserIcon size={11} />}
                    </div>
                    <p className="min-w-0 break-words text-sm text-gray-500 dark:text-gray-400">
                      From{" "}
                      <span className="font-semibold text-gray-700 dark:text-gray-300">
                        {transfer.senderName ?? transfer.senderEmail}
                      </span>
                      {transfer.senderName && transfer.senderEmail && (
                        <span className="ml-1 text-xs text-gray-400">({transfer.senderEmail})</span>
                      )}
                    </p>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <CloudUpload size={10} className="text-sky-500" />
                    {transfer.fileCount} file{transfer.fileCount !== 1 ? "s" : ""}
                    {hasFolders && ` in ${folders.length} folder${folders.length !== 1 ? "s" : ""}`}
                  </span>
                  <span>{formatBytes(transfer.totalSize)}</span>
                  {transfer.hasPassword && (
                    <span className="flex items-center gap-1 text-orange-500">
                      <Shield size={10} /> Protected
                    </span>
                  )}
                  {canDownload && daysLeft !== null && daysLeft > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> {daysLeft}d left
                    </span>
                  )}
                  {transfer.expiresAt && !isExpired && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> Expires {formatDate(transfer.expiresAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {transfer.message && (
              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-zinc-700/60 dark:bg-zinc-800/50">
                <p className="text-sm italic leading-relaxed text-gray-600 dark:text-gray-400">
                  &ldquo;{transfer.message}&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* File / folder tree */}
          <div className="divide-y divide-gray-100/80 dark:divide-zinc-800/60">
            {folders.map((folder) => (
              <FolderRow
                key={folder.path}
                node={folder}
                depth={0}
                password={password}
                shortId={shortId}
                unlocked={unlocked}
                downloading={canDownload ? downloading : null}
                onDownload={canDownload ? handleDownload : () => {}}
                canDownload={canDownload}
              />
            ))}
            {rootFiles.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                depth={0}
                downloading={canDownload ? downloading : null}
                onDownload={canDownload ? handleDownload : () => {}}
              />
            ))}
          </div>

          {/* Download error banner */}
          {downloadError && (
            <div className="flex items-start gap-2.5 border-t border-red-100 bg-red-50 px-4 py-3 dark:border-red-900/20 dark:bg-red-900/10 sm:items-center sm:gap-3 sm:px-5">
              <AlertCircle size={14} className="shrink-0 text-red-500" />
              <p className="min-w-0 flex-1 break-words text-xs font-medium text-red-600 dark:text-red-400 sm:text-sm">{downloadError}</p>
              <button type="button" aria-label="Dismiss error" onClick={() => setDownloadError(null)}
                className="shrink-0 text-red-400 hover:text-red-600">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Actions footer */}
          {canDownload && (
            <div className="border-t border-gray-100 px-3 py-3 dark:border-zinc-800 sm:px-5 sm:py-4">
              {transfer.files.length > 1 ? (
                <button type="button" onClick={handleDownloadAll} disabled={downloadingAll}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 py-3 text-center text-sm font-bold text-white shadow-md shadow-orange-500/20 transition-all hover:bg-orange-600 hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-70 sm:gap-2.5 sm:rounded-2xl sm:text-base">
                  {downloadingAll
                    ? <><Loader2 size={16} className="animate-spin" /> Preparing ZIP…</>
                    : <><Download size={16} /> Download All as ZIP · {formatBytes(transfer.totalSize)}</>}
                </button>
              ) : (
                transfer.files[0] && (
                  <button type="button"
                    disabled={downloading === transfer.files[0].id}
                    onClick={() => handleDownload(transfer.files[0].id, transfer.files[0].name)}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 py-3 text-center text-sm font-bold text-white shadow-md shadow-orange-500/20 transition-all hover:bg-orange-600 disabled:opacity-70 sm:gap-2.5 sm:rounded-2xl sm:text-base">
                    {downloading === transfer.files[0].id
                      ? <><Loader2 size={16} className="animate-spin" /> Preparing…</>
                      : <><Download size={16} /> Download · {formatBytes(transfer.files[0].size)}</>}
                  </button>
                )
              )}
            </div>
          )}

          {!canDownload && (
            <div className="border-t border-gray-100 px-4 py-4 text-center dark:border-zinc-800 sm:px-5">
              <p className="text-sm text-gray-400">Downloads are unavailable for this transfer.</p>
            </div>
          )}
        </div>

        {/* Security badges */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-2 text-[11px] text-gray-400 dark:text-gray-600 sm:mt-6 sm:gap-x-4 sm:text-xs">
          <span className="flex items-center gap-1">
            <Shield size={11} className="text-emerald-500" /> End-to-end encrypted
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="flex items-center gap-1">
            <CloudUpload size={11} className="text-sky-500" /> Cloudflare R2
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="flex items-center gap-1">
            <Sparkles size={11} className="text-orange-400" /> Jai Export Enterprises
          </span>
        </div>

      </div>
    </div>
  );
}
