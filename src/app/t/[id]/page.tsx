"use client";

import BrandLogo from "@/components/ui/BrandLogo";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Download, Lock, FileText, Image as ImageIcon, Video, Archive, Music, Code,
  Table2, File, Clock, CheckCircle, XCircle, Eye, EyeOff,
  AlertTriangle, Loader2, Shield, Folder, FolderOpen,
  ChevronDown, ChevronRight, CloudUpload, Send, Sparkles,
  AlertCircle, X, Check, RefreshCw, User as UserIcon,
} from "lucide-react";
import { formatBytes, formatDate, getInitials } from "@/lib/utils";
import { BASE_URL } from "@/lib/api";
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
    <header className="relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl border border-white/30 bg-linear-to-r from-[rgb(62,120,1)] via-[rgb(73,140,1)] to-orange-500 px-4 py-3.5 text-white shadow-xl shadow-green-800/15 sm:px-6 sm:py-4">
      <div className="pointer-events-none absolute -left-8 -top-14 h-32 w-32 rounded-full border border-white/15 bg-white/5" />
      <div className="pointer-events-none absolute -bottom-16 right-20 h-36 w-36 rounded-full border border-orange-200/20 bg-orange-300/10" />
      <div className="relative min-w-0 text-left">
        <p className="company-name truncate text-sm font-black uppercase tracking-[0.16em] sm:text-base sm:tracking-[0.2em]">
          Jai Export Enterprises
        </p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-[10px] font-medium text-white/80 sm:text-xs">
          <Shield size={11} /> Secure File Transfer <span className="text-orange-200">·</span> Cloudflare R2
        </p>
      </div>
      <BrandLogo className="h-12 w-12" />
    </header>
  );
}

/* ──────────────────────────────────────────
   File icon
────────────────────────────────────────── */
function FileIcon({ ext, size = 18 }: { ext: string; size?: number }) {
  const e = ext.toLowerCase();
  if (["pdf"].includes(e))                                   return <FileText size={size} className="text-orange-600" />;
  if (["jpg","jpeg","png","gif","svg","webp","bmp"].includes(e)) return <ImageIcon size={size} className="text-green-600" />;
  if (["mp4","mov","avi","mkv","webm"].includes(e))          return <Video    size={size} className="text-orange-500" />;
  if (["mp3","wav","ogg","flac","aac"].includes(e))          return <Music    size={size} className="text-green-500" />;
  if (["zip","tar","gz","rar","7z"].includes(e))             return <Archive  size={size} className="text-orange-600" />;
  if (["xls","xlsx","csv"].includes(e))                      return <Table2   size={size} className="text-green-600" />;
  if (["doc","docx"].includes(e))                            return <FileText size={size} className="text-orange-500" />;
  if (["js","ts","jsx","tsx","py","rb","go","rs"].includes(e))return <Code    size={size} className="text-green-600" />;
  return <File size={size} className="text-gray-400" />;
}

function ExtBadge({ ext }: { ext: string }) {
  return (
    <span className="rounded-md bg-linear-to-r from-green-50 to-orange-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700 ring-1 ring-green-100 dark:from-green-950/30 dark:to-orange-950/30 dark:text-green-400 dark:ring-green-900/40">
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
  node, depth = 0, password, shortId, unlocked, downloading, downloaded, onDownload, canDownload,
}: {
  node: FolderNode;
  depth?: number;
  password: string;
  shortId: string;
  unlocked: boolean;
  downloading: string | null;
  downloaded: ReadonlySet<string>;
  onDownload: (id: string, name: string) => void;
  canDownload: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [downloadingFolder, setDownloadingFolder] = useState(false);
  const [downloadedFolder, setDownloadedFolder] = useState(false);
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
      setDownloadedFolder(true);
    } finally {
      setTimeout(() => setDownloadingFolder(false), 1500);
    }
  }

  return (
    <div>
      <div className={`flex w-full items-center gap-1.5 py-3 pr-2 transition-colors hover:bg-linear-to-r hover:from-green-50/70 hover:to-orange-50/50 dark:hover:from-green-950/15 dark:hover:to-orange-950/10 sm:gap-2 sm:pr-3 ${folderPl(depth)}`}>
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left sm:gap-2"
        >
          {open
            ? <ChevronDown size={12} className="shrink-0 text-gray-400" />
            : <ChevronRight size={12} className="shrink-0 text-gray-400" />}
          {open
            ? <FolderOpen size={15} className="shrink-0 text-orange-500" />
            : <Folder size={15} className="shrink-0 text-orange-500" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-800 dark:text-gray-200">{node.name}</span>
            {downloadedFolder && (
              <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400">
                <Check size={10} strokeWidth={3} /> Folder downloaded
              </span>
            )}
          </span>
          <span className="mr-1 hidden shrink-0 text-[11px] text-gray-400 sm:inline">
            {totalFiles} file{totalFiles !== 1 ? "s" : ""}
          </span>
        </button>
        {canDownload && (
          <button
            type="button"
            disabled={downloadingFolder}
            onClick={handleFolderDownload}
            title={downloadedFolder ? `Download ${node.name} again` : `Download ${node.name} as ZIP`}
            className={`flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[10px] font-bold transition-all disabled:opacity-60 sm:h-8 sm:text-xs ${downloadedFolder ? "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" : "bg-orange-50 text-orange-600 hover:bg-linear-to-br hover:from-[rgb(73,140,1)] hover:to-orange-500 hover:text-white dark:bg-orange-900/20"}`}
          >
            {downloadingFolder
              ? <><Loader2 size={12} className="animate-spin" /> Preparing…</>
              : downloadedFolder
                ? <><RefreshCw size={12} /> Download again</>
                : <><Download size={12} /> Download</>}
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
              downloaded={downloaded}
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
              downloaded={downloaded.has(f.id)}
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
  file, depth = 0, downloading, downloaded, onDownload,
}: {
  file: TransferFile;
  depth?: number;
  downloading: string | null;
  downloaded: boolean;
  onDownload: (id: string, name: string) => void;
}) {
  return (
    <div
      className={`flex items-start gap-2 border-b border-green-100/70 py-3 pr-2 transition-colors last:border-0 hover:bg-linear-to-r hover:from-green-50/60 hover:to-orange-50/40 dark:border-green-900/20 dark:hover:from-green-950/15 dark:hover:to-orange-950/10 sm:gap-3 sm:pr-5 ${filePl(depth)}`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-green-50 to-orange-50 ring-1 ring-green-100 dark:from-green-950/30 dark:to-orange-950/30 dark:ring-green-900/30 sm:h-9 sm:w-9 sm:rounded-xl">
        <FileIcon ext={file.extension} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-all text-sm font-semibold leading-snug text-gray-900 dark:text-white">{file.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
          <ExtBadge ext={file.extension} />
        </div>
        {downloaded && (
          <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400">
            <Check size={10} strokeWidth={3} /> File downloaded
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={downloading === file.id}
        onClick={() => onDownload(file.id, file.name)}
        title={downloaded ? `Download ${file.name} again` : `Download ${file.name}`}
        className={`flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[10px] font-bold transition-all disabled:opacity-60 sm:h-8 sm:text-xs ${downloaded ? "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" : "bg-orange-50 text-orange-600 hover:bg-linear-to-br hover:from-[rgb(73,140,1)] hover:to-orange-500 hover:text-white dark:bg-orange-900/20"}`}
      >
        {downloading === file.id
          ? <><Loader2 size={13} className="animate-spin" /> Preparing…</>
          : downloaded
            ? <><RefreshCw size={12} /> Download again</>
            : <><Download size={13} /> Download</>}
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
  const [downloadedAll,  setDownloadedAll]  = useState(false);
  const [downloadedFiles, setDownloadedFiles] = useState<Set<string>>(() => new Set());
  const [downloadError,  setDownloadError]  = useState<string | null>(null);

  const [mountedAt] = useState(Date.now);

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
      setDownloadedFiles((current) => new Set(current).add(fileId));
      setDownloadError(null);
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
      setDownloadedAll(true);
      setDownloadError(null);
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
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-green-50 via-white to-orange-50 p-4 dark:from-green-950/30 dark:via-zinc-950 dark:to-orange-950/20">
        <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-green-300/20 blur-3xl dark:bg-green-700/10" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-orange-300/25 blur-3xl dark:bg-orange-700/10" />
        <div className="relative flex w-full max-w-xs flex-col items-center gap-5 rounded-3xl border border-white/80 bg-white/85 px-8 py-10 text-center shadow-2xl shadow-green-900/10 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/85">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-[rgb(73,140,1)] to-orange-500 text-white shadow-xl shadow-green-700/20">
            <Send size={24} />
            <Loader2 size={20} className="absolute -bottom-2 -right-2 animate-spin rounded-full bg-white p-0.5 text-orange-500 shadow-md dark:bg-zinc-900" />
          </div>
          <div>
            <p className="text-base font-extrabold text-gray-900 dark:text-white">Opening your transfer</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Checking the secure link and preparing your files…</p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-green-100 dark:bg-green-950/40">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-linear-to-r from-[rgb(73,140,1)] to-orange-500" />
          </div>
        </div>
      </main>
    );
  }

  /* ── Hard error ── */
  if (error) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-green-50 via-white to-orange-50 p-4 dark:from-green-950/30 dark:via-zinc-950 dark:to-orange-950/20">
        <div className="pointer-events-none absolute -left-24 top-12 h-72 w-72 rounded-full bg-green-300/20 blur-3xl dark:bg-green-700/10" />
        <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-orange-300/25 blur-3xl dark:bg-orange-700/10" />
        <div className="relative w-full max-w-md">
          <BrandHeader />
          <div className="mt-4 overflow-hidden rounded-3xl border border-orange-200/70 bg-white/90 shadow-2xl shadow-orange-900/10 backdrop-blur-xl dark:border-orange-900/30 dark:bg-zinc-900/90">
            <div className="h-1.5 bg-linear-to-r from-[rgb(73,140,1)] via-green-500 to-orange-500" />
            <div className="px-6 py-9 text-center sm:px-9">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-orange-50 to-green-50 ring-1 ring-orange-200 dark:from-orange-950/30 dark:to-green-950/20 dark:ring-orange-900/40">
                <XCircle size={36} className="text-orange-500" />
              </div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Secure link status</p>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Transfer unavailable</h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">{error}</p>
              <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 ring-1 ring-green-100 dark:bg-green-950/20 dark:text-green-400 dark:ring-green-900/30">
                <Shield size={12} /> Protected by Jai Export Enterprises
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ── Password gate ── */
  if (transfer?.hasPassword && !unlocked) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-green-50 via-white to-orange-50 p-3 dark:from-green-950/30 dark:via-zinc-950 dark:to-orange-950/20 sm:p-4">
        <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-green-300/20 blur-3xl dark:bg-green-700/10" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-orange-300/25 blur-3xl dark:bg-orange-700/10" />
        <div className="relative w-full max-w-md">
          <div className="mb-4"><BrandHeader /></div>

          <div className="overflow-hidden rounded-3xl border border-green-200/70 bg-white/90 shadow-2xl shadow-green-900/10 backdrop-blur-xl dark:border-green-900/30 dark:bg-zinc-900/90">
            <div className="h-1.5 w-full bg-linear-to-r from-[rgb(73,140,1)] via-green-500 to-orange-500" />
            <div className="px-5 py-7 sm:px-8 sm:py-9">
              <div className="mx-auto mb-5 flex h-18 w-18 items-center justify-center rounded-3xl bg-linear-to-br from-[rgb(73,140,1)] to-orange-500 text-white shadow-xl shadow-green-700/20">
                <Lock size={29} />
              </div>
              <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-green-700 dark:text-green-400">Private transfer</p>
              <h1 className="text-center text-2xl font-black tracking-tight text-gray-900 dark:text-white">Password protected</h1>
              <p className="mx-auto mb-7 mt-2 max-w-xs text-center text-sm leading-6 text-gray-500 dark:text-gray-400">
                Enter the password shared by the sender to securely access these files.
              </p>

              <div className="relative mb-2">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                  placeholder="Enter password"
                  autoFocus
                  className="h-13 w-full rounded-2xl border border-green-200 bg-green-50/50 px-4 pr-12 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-orange-400 focus:bg-white focus:ring-3 focus:ring-orange-500/10 dark:border-green-900/40 dark:bg-green-950/10 dark:text-white"
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
                className="mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-[rgb(73,140,1)] via-green-600 to-orange-500 font-bold text-white shadow-lg shadow-green-700/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-500/20 disabled:translate-y-0 disabled:opacity-60">
                {unlocking ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                {unlocking ? "Unlocking…" : "Unlock Transfer"}
              </button>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <Shield size={12} className="text-green-600" /> Files stored securely on Cloudflare R2
          </div>
        </div>
      </main>
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
    <main className="relative min-h-screen overflow-x-hidden bg-linear-to-br from-green-50 via-white to-orange-50 p-3 dark:from-green-950/25 dark:via-zinc-950 dark:to-orange-950/20 sm:p-5 lg:p-8">
      <div className="pointer-events-none absolute -left-36 top-20 h-96 w-96 rounded-full bg-green-300/20 blur-3xl dark:bg-green-700/10" />
      <div className="pointer-events-none absolute -right-36 top-1/3 h-96 w-96 rounded-full bg-orange-300/25 blur-3xl dark:bg-orange-700/10" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r from-[rgb(73,140,1)] via-green-500 to-orange-500" />
      <div className="relative mx-auto max-w-4xl py-3 sm:py-5 lg:py-7">

        {/* Brand header */}
        <div className="mb-5 sm:mb-7"><BrandHeader /></div>

        {/* Main card */}
        <div className="overflow-hidden rounded-3xl border border-green-200/70 bg-white/90 shadow-2xl shadow-green-900/10 backdrop-blur-xl dark:border-green-900/30 dark:bg-zinc-900/90">

          {/* Top accent */}
          <div className="h-1.5 w-full bg-linear-to-r from-[rgb(73,140,1)] via-green-500 to-orange-500" />

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
            <div className="flex items-center gap-2.5 border-b border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900/30 dark:bg-orange-900/10 sm:gap-3 sm:px-5">
              <AlertTriangle size={14} className="shrink-0 text-orange-600 dark:text-orange-400" />
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 sm:text-sm">
                Expires {daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
              </p>
            </div>
          )}

          {/* Transfer header */}
          <div className="relative overflow-hidden border-b border-green-100 bg-linear-to-br from-green-50 via-white to-orange-50 px-4 py-6 dark:border-green-900/25 dark:from-green-950/25 dark:via-zinc-900 dark:to-orange-950/20 sm:px-7 sm:py-8">
            <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full border border-orange-200/50 bg-orange-100/30 dark:border-orange-900/20 dark:bg-orange-900/10" />
            <div className="relative flex items-start gap-3 sm:gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-[rgb(73,140,1)] to-orange-500 text-white shadow-xl shadow-green-700/20 sm:h-15 sm:w-15">
                <CloudUpload size={23} />
              </div>
              <div className="min-w-0 flex-1">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-green-700 shadow-sm ring-1 ring-green-100 dark:bg-zinc-900 dark:text-green-400 dark:ring-green-900/40">
                      <Shield size={11} /> Secure transfer
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-orange-700 ring-1 ring-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:ring-orange-900/40">
                      <CheckCircle size={11} /> Ready
                    </span>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-700 dark:text-green-400">Subject</p>
                  <h1 className="mt-1 break-words text-xl font-black leading-tight tracking-tight text-gray-900 dark:text-white sm:text-3xl">
                    {transfer.subject ?? transfer.title ?? "Files for you"}
                  </h1>
                  {transfer.title && transfer.subject && transfer.title !== transfer.subject && (
                    <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl border border-orange-100 bg-white/80 px-3 py-2 text-sm shadow-sm dark:border-orange-900/30 dark:bg-zinc-900/70">
                      <FileText size={13} className="shrink-0 text-orange-500" />
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-orange-500">Title</span>
                      <span className="min-w-0 truncate font-semibold text-gray-700 dark:text-gray-300">{transfer.title}</span>
                    </div>
                  )}
                </div>

                {/* Sender info */}
                {(transfer.senderName || transfer.senderEmail) && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-green-100 to-orange-100 text-[10px] font-black text-green-700 ring-1 ring-green-200 dark:from-green-950/40 dark:to-orange-950/30 dark:text-green-400 dark:ring-green-900/40">
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

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex items-center gap-1.5 rounded-lg bg-green-100/70 px-2.5 py-1.5 font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-400">
                    <File size={11} />
                    {transfer.fileCount} file{transfer.fileCount !== 1 ? "s" : ""}
                    {hasFolders && ` in ${folders.length} folder${folders.length !== 1 ? "s" : ""}`}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-lg bg-orange-100/70 px-2.5 py-1.5 font-semibold text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
                    <CloudUpload size={11} /> {formatBytes(transfer.totalSize)}
                  </span>
                  {transfer.hasPassword && (
                    <span className="flex items-center gap-1.5 rounded-lg bg-green-100/70 px-2.5 py-1.5 font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-400">
                      <Lock size={11} /> Protected
                    </span>
                  )}
                  {canDownload && daysLeft !== null && daysLeft > 0 && (
                    <span className="flex items-center gap-1.5 rounded-lg bg-orange-100/70 px-2.5 py-1.5 font-semibold text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
                      <Clock size={11} /> {daysLeft}d left
                    </span>
                  )}
                  {transfer.expiresAt && !isExpired && (
                    <span className="flex items-center gap-1.5 rounded-lg bg-green-100/70 px-2.5 py-1.5 font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-400">
                      <Clock size={11} /> Expires {formatDate(transfer.expiresAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {transfer.message && (
              <div className="relative mt-5 rounded-2xl border border-orange-200/70 bg-white/80 px-4 py-3.5 shadow-sm dark:border-orange-900/30 dark:bg-zinc-900/70">
                <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-linear-to-b from-[rgb(73,140,1)] to-orange-500" />
                <p className="mb-1 pl-1 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-500">Message</p>
                <p className="whitespace-pre-wrap pl-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  {transfer.message}
                </p>
              </div>
            )}
          </div>

          {/* File / folder tree */}
          <div className="flex items-center justify-between gap-3 border-b border-green-100 px-4 py-3.5 dark:border-green-900/25 sm:px-6">
            <div>
              <p className="text-sm font-extrabold text-gray-900 dark:text-white">Files in this transfer</p>
              <p className="mt-0.5 text-xs text-gray-400">Download individual items or complete folders</p>
            </div>
            <span className="rounded-full bg-linear-to-r from-green-100 to-orange-100 px-3 py-1 text-xs font-bold text-green-700 ring-1 ring-green-200 dark:from-green-950/30 dark:to-orange-950/30 dark:text-green-400 dark:ring-green-900/30">
              {transfer.fileCount}
            </span>
          </div>
          <div className="divide-y divide-green-100/70 dark:divide-green-900/20">
            {folders.map((folder) => (
              <FolderRow
                key={folder.path}
                node={folder}
                depth={0}
                password={password}
                shortId={shortId}
                unlocked={unlocked}
                downloading={canDownload ? downloading : null}
                downloaded={downloadedFiles}
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
                downloaded={downloadedFiles.has(f.id)}
                onDownload={canDownload ? handleDownload : () => {}}
              />
            ))}
            {transfer.files.length === 0 && (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-green-50 to-orange-50 text-orange-500 ring-1 ring-orange-100 dark:from-green-950/20 dark:to-orange-950/20 dark:ring-orange-900/30">
                  <File size={20} />
                </div>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">No files available</p>
                <p className="mt-1 text-xs text-gray-400">This transfer does not contain downloadable files.</p>
              </div>
            )}
          </div>

          {/* Download error banner */}
          {downloadError && (
            <div role="alert" className="flex items-start gap-2.5 border-t border-red-100 bg-red-50 px-4 py-3 dark:border-red-900/20 dark:bg-red-900/10 sm:items-center sm:gap-3 sm:px-5">
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
            <div className="border-t border-green-100 bg-linear-to-r from-green-50/60 via-white to-orange-50/60 px-3 py-4 dark:border-green-900/25 dark:from-green-950/15 dark:via-zinc-900 dark:to-orange-950/15 sm:px-6 sm:py-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-gray-900 dark:text-white">
                    {downloadedAll
                      ? "All files downloaded"
                      : transfer.files.length === 1 && downloadedFiles.has(transfer.files[0].id)
                        ? "File downloaded"
                        : "Ready to download"}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {downloadedAll || (transfer.files.length === 1 && downloadedFiles.has(transfer.files[0].id))
                      ? "You can download again whenever needed."
                      : `Secure access to ${formatBytes(transfer.totalSize)}`}
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-green-100 to-orange-100 text-green-700 ring-1 ring-green-200 dark:from-green-950/30 dark:to-orange-950/20 dark:text-green-400 dark:ring-green-900/30">
                  {downloadedAll || (transfer.files.length === 1 && downloadedFiles.has(transfer.files[0].id))
                    ? <Check size={17} strokeWidth={3} />
                    : <Download size={17} />}
                </div>
              </div>
              {transfer.files.length > 1 ? (
                <button type="button" onClick={handleDownloadAll} disabled={downloadingAll}
                  className={`flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl px-3 py-3 text-center text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70 sm:gap-2.5 sm:text-base ${downloadedAll ? "bg-green-700 shadow-green-700/20 hover:bg-green-800" : "bg-linear-to-r from-[rgb(62,120,1)] via-green-600 to-orange-500 shadow-green-700/20 hover:shadow-xl hover:shadow-orange-500/25"}`}>
                  {downloadingAll
                    ? <><Loader2 size={16} className="animate-spin" /> Preparing ZIP…</>
                    : downloadedAll
                      ? <><RefreshCw size={16} /> Download again</>
                      : <><Download size={16} /> Download all as ZIP · {formatBytes(transfer.totalSize)}</>}
                </button>
              ) : (
                transfer.files[0] && (
                  <button type="button"
                    disabled={downloading === transfer.files[0].id}
                    onClick={() => handleDownload(transfer.files[0].id, transfer.files[0].name)}
                    className={`flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl px-3 py-3 text-center text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70 sm:gap-2.5 sm:text-base ${downloadedFiles.has(transfer.files[0].id) ? "bg-green-700 shadow-green-700/20 hover:bg-green-800" : "bg-linear-to-r from-[rgb(62,120,1)] via-green-600 to-orange-500 shadow-green-700/20 hover:shadow-xl hover:shadow-orange-500/25"}`}>
                    {downloading === transfer.files[0].id
                      ? <><Loader2 size={16} className="animate-spin" /> Preparing…</>
                      : downloadedFiles.has(transfer.files[0].id)
                        ? <><RefreshCw size={16} /> Download again</>
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
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border border-white/80 bg-white/60 px-4 py-3 text-[11px] text-gray-500 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-gray-400 sm:mt-6 sm:gap-x-4 sm:text-xs">
          <span className="flex items-center gap-1.5">
            <Shield size={11} className="text-green-600" /> End-to-end encrypted
          </span>
          <span className="hidden text-orange-300 sm:inline">·</span>
          <span className="flex items-center gap-1.5">
            <CloudUpload size={11} className="text-orange-500" /> Cloudflare R2
          </span>
          <span className="hidden text-green-300 sm:inline">·</span>
          <span className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-orange-500" /> <span className="company-name">Jai Export Enterprises</span>
          </span>
        </div>

      </div>
    </main>
  );
}
