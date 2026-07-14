"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type DragEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { Badge, Spinner } from "@/components/ui";
import Button from "@/components/ui/Button";
import {
  Send,
  Mail,
  Link as LinkIcon,
  QrCode,
  Upload,
  X,
  Plus,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Users,
  Inbox,
  Star,
  ArrowRight,
  RefreshCw,
  Download,
  Zap,
  AlertCircle,
  CheckCircle,
  CloudUpload,
  FolderOpen,
  Folder,
  MessageCircle,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Archive,
  Table2,
  Monitor,
  Code,
  File,
  Shield,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Share2,
  Smartphone,
  Info,
  TrendingUp,
} from "lucide-react";
import { formatBytes, formatRelative } from "@/lib/utils";
import { UPLOAD_LIMITS } from "@/helper/data_helper";
import {
  getTransferFileCount,
  getTransfersFromResponse,
  getTransferTotalSize,
} from "@/lib/transfers";
import { getErrorMessage, handleApiError } from "@/lib/error-handler";
import { parseRecipientEmails } from "@/lib/validation";
import { notifyAppDataChanged } from "@/lib/app-events";
import { transfersApi, uploadApi } from "@/lib/api";
import { showToast } from "@/lib/toast";
import StoragePickerModal, { type PickedFile } from "@/components/modals/StoragePickerModal";
import { Transfer } from "@/types";

/* ──────────────────────────────────────────
   Concurrency-limited parallel runner
────────────────────────────────────────── */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/* ──────────────────────────────────────────
   Folder traversal helpers
────────────────────────────────────────── */
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const results: FileSystemEntry[] = [];
    function read() {
      reader.readEntries((entries) => {
        if (entries.length === 0) resolve(results);
        else { results.push(...entries); read(); }
      }, reject);
    }
    read();
  });
}

async function traverseEntry(
  entry: FileSystemEntry,
  basePath: string,
  out: { file: File; relativePath: string }[],
): Promise<void> {
  if (entry.isFile) {
    await new Promise<void>((resolve, reject) =>
      (entry as FileSystemFileEntry).file((f) => {
        out.push({ file: f, relativePath: basePath ? `${basePath}/${f.name}` : f.name });
        resolve();
      }, reject),
    );
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await readAllEntries(reader);
    await pool(
      entries.map((e) => () =>
        traverseEntry(e, basePath ? `${basePath}/${entry.name}` : entry.name, out),
      ),
      FOLDER_TRAVERSAL_CONCURRENCY,
    );
  }
}

/* ──────────────────────────────────────────
   Types
────────────────────────────────────────── */
type SendMethod = "email" | "link" | "qr";
type ExpiryPreset = "1-day" | "1-week" | "1-month";
type FileStatus = "idle" | "uploading" | "done" | "error";
type SendPhase  = "idle" | "uploading" | "creating" | "done";

/** Metadata for files already in storage (pre-selected from Files page) */
interface PreloadedFile {
  id: string;
  _id?: string;
  key?: string;
  name: string;
  size: number;
  mimeType: string;
  extension: string;
  relativePath?: string;
}

interface SendFile {
  id: string;
  file: File;
  progress: number;
  uploadedBytes: number;
  status: FileStatus;
  key?: string;
  fileId?: string;
  error?: string;
  relativePath?: string;
}

interface TransferStats {
  totalTransfers: number;
  selfTransfers:  number;
  totalUsers:     number;
  receivedMails:  number;
  starredMails:   number;
  activeLinks:    number;
}

type SendTransferResponse = Partial<Transfer> & {
  _id?: string;
  transfer?: Transfer;
  link?: Transfer["link"] | string;
  shortCode?: string;
};

type SendPayload = Parameters<typeof transfersApi.send>[0];

type UploadResponseData = {
  id?: string;
  _id?: string;
  fileId?: string;
  key?: string;
  uploadSessionId?: string;
  file?: {
    id?: string;
    _id?: string;
    key?: string;
    uploadSessionId?: string;
  };
};

const FOLDER_TRAVERSAL_CONCURRENCY = 16;
const SMOOTH_PROGRESS_INTERVAL_MS = 24;
const MAX_EXPIRY_DAYS = 365;
const EXPIRY_PRESETS: { value: ExpiryPreset; label: string }[] = [
  { value: "1-day", label: "1 Day" },
  { value: "1-week", label: "1 Week" },
  { value: "1-month", label: "1 Month" },
];

function toDateTimeLocalValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getPresetExpiryValue(preset: ExpiryPreset): string {
  const date = new Date();
  if (preset === "1-day") date.setDate(date.getDate() + 1);
  if (preset === "1-week") date.setDate(date.getDate() + 7);
  if (preset === "1-month") {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  }
  return toDateTimeLocalValue(date);
}

function formatExpiry(value: string): string {
  if (!value) return "Select date & time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date & time";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getExpiryError(value: string, now = Date.now()): string | null {
  const expiryTime = new Date(value).getTime();
  if (!value || Number.isNaN(expiryTime)) return "Choose an expiry date and time";
  if (expiryTime <= now) return "Expiry date and time must be in the future";
  if (expiryTime > now + MAX_EXPIRY_DAYS * 86_400_000) {
    return "Expiry cannot be more than one year from now";
  }
  return null;
}

function fileIdentity(file: File, relativePath?: string) {
  return [
    relativePath || file.webkitRelativePath || file.name,
    file.size,
    file.lastModified,
  ].join("::");
}

function getUploadFileConcurrency(files: SendFile[], totalSize: number) {
  if (files.length <= 1) return 1;
  const hasMultipartFile = files.some((sf) => sf.file.size >= UPLOAD_LIMITS.MULTIPART_THRESHOLD);
  if (totalSize >= 2 * 1024 ** 3) return 1;
  if (hasMultipartFile) return 2;
  return 4;
}

function useSmoothProgress(target: number, active = true) {
  const normalizedTarget = Math.max(0, Math.min(100, Math.round(target)));
  const [displayValue, setDisplayValue] = useState(normalizedTarget);

  useEffect(() => {
    if (!active) {
      setDisplayValue(normalizedTarget);
      return;
    }

    setDisplayValue((current) => {
      if (normalizedTarget === 0 || normalizedTarget < current) return normalizedTarget;
      return current;
    });

    const id = window.setInterval(() => {
      setDisplayValue((current) => {
        if (current >= normalizedTarget) {
          window.clearInterval(id);
          return normalizedTarget;
        }
        return Math.min(normalizedTarget, current + 1);
      });
    }, SMOOTH_PROGRESS_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [active, normalizedTarget]);

  return displayValue;
}

function SmoothProgressText({ value, className }: { value: number; className?: string }) {
  const displayValue = useSmoothProgress(value);
  return <span className={className}>{displayValue}%</span>;
}

interface CompletedTransferSummary {
  method: SendMethod;
  title: string;
  recipients: string[];
  totalFileCount: number;
  totalSize: number;
  link: string;
}

function extractPreloadedFileId(file: Partial<PreloadedFile>): string {
  const id = file.id ?? file._id;
  if (typeof id === "string") return id;
  if (id && typeof id === "object" && "toString" in id) return String(id);
  return "";
}

function normalizePreloadedFile(file: Partial<PreloadedFile>): PreloadedFile | null {
  const id = extractPreloadedFileId(file);
  if (!id || !file.name) return null;
  return {
    id,
    name: file.name,
    size: file.size ?? 0,
    mimeType: file.mimeType ?? "",
    extension: file.extension ?? "",
    ...(file.key ? { key: file.key } : {}),
    ...(file.relativePath ? { relativePath: file.relativePath } : {}),
  };
}

function transferShareText(url: string) {
  return `Here is the secure Jai Export Enterprises transfer link: ${url}`;
}

function shareHref(kind: "email" | "whatsapp" | "sms", url: string) {
  const text = transferShareText(url);
  if (kind === "email") {
    return `mailto:?subject=${encodeURIComponent("Secure file transfer")}&body=${encodeURIComponent(text)}`;
  }
  if (kind === "whatsapp") {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }
  return `sms:?&body=${encodeURIComponent(text)}`;
}

function qrImageUrl(url: string, size = 320) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=16&data=${encodeURIComponent(url)}`;
}

/* ──────────────────────────────────────────
   Method config
────────────────────────────────────────── */
const METHODS: {
  key: SendMethod;
  label: string;
  shortLabel: string;
  icon: (s?: number) => React.ReactNode;
  color: string;
  activeBg: string;
  passiveBg: string;
  description: string;
  gradient: string;
  accentColor: string;
}[] = [
  {
    key: "email", label: "Send via Email", shortLabel: "Email",
    icon: (s = 20) => <Mail size={s} />,
    color: "text-blue-500",
    activeBg: "bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25",
    passiveBg: "bg-blue-500/8 border-blue-200/60 text-blue-600 dark:border-blue-900/40 dark:text-blue-400 hover:bg-blue-500/15",
    description: "Send files directly to email addresses",
    gradient: "from-blue-500 to-blue-600",
    accentColor: "blue",
  },
  {
    key: "link", label: "Share via Link", shortLabel: "Link",
    icon: (s = 20) => <LinkIcon size={s} />,
    color: "text-purple-500",
    activeBg: "bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/25",
    passiveBg: "bg-purple-500/8 border-purple-200/60 text-purple-600 dark:border-purple-900/40 dark:text-purple-400 hover:bg-purple-500/15",
    description: "Generate a secure, shareable link",
    gradient: "from-purple-500 to-purple-600",
    accentColor: "purple",
  },
  {
    key: "qr", label: "QR Code", shortLabel: "QR Code",
    icon: (s = 20) => <QrCode size={s} />,
    color: "text-emerald-500",
    activeBg: "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25",
    passiveBg: "bg-emerald-500/8 border-emerald-200/60 text-emerald-600 dark:border-emerald-900/40 dark:text-emerald-400 hover:bg-emerald-500/15",
    description: "Scan-to-download QR code",
    gradient: "from-emerald-500 to-emerald-600",
    accentColor: "emerald",
  },
];

/* ──────────────────────────────────────────
   Status badge
────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "success" | "warning" | "danger" | "info"; label: string }> = {
    active:    { variant: "success", label: "Active"    },
    delivered: { variant: "success", label: "Delivered" },
    disabled:  { variant: "default", label: "Disabled"  },
    pending:   { variant: "warning", label: "Pending"   },
    expired:   { variant: "default", label: "Expired"   },
    opened:    { variant: "info",    label: "Opened"    },
  } as const;
  const { variant, label } = map[status] ?? { variant: "default" as const, label: status };
  return <Badge variant={variant}>{label}</Badge>;
}

/* ──────────────────────────────────────────
   File icon helper
────────────────────────────────────────── */
function fileIcon(file: File) {
  const t = file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (t.startsWith("image/")) return <ImageIcon size={16} className="text-blue-500" />;
  if (t.startsWith("video/") || ext === "3gp" || ext === "3g2") return <Video size={16} className="text-purple-500" />;
  if (t.startsWith("audio/")) return <Music   size={16} className="text-pink-500" />;
  if (t.includes("pdf"))      return <FileText size={16} className="text-red-500" />;
  if (t.includes("zip") || t.includes("rar") || t.includes("7z")) return <Archive size={16} className="text-amber-500" />;
  if (t.includes("word") || t.includes("document"))               return <FileText size={16} className="text-blue-600" />;
  if (t.includes("excel") || t.includes("sheet"))                 return <Table2   size={16} className="text-green-600" />;
  if (t.includes("powerpoint") || t.includes("presentation"))     return <Monitor  size={16} className="text-orange-500" />;
  if (t.startsWith("text/"))  return <Code size={16} className="text-cyan-500" />;
  return <File size={16} className="text-gray-400" />;
}

/* ──────────────────────────────────────────
   Progress fill — sets width via ref to avoid inline style warnings
────────────────────────────────────────── */
function ProgressFill({ value, className }: { value: number; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.style.width = `${value}%`;
  }, [value]);
  return <div ref={ref} className={className} />;
}

function uploadFileRowClass(status: FileStatus) {
  const base = "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors";
  if (status === "done") {
    return `${base} border-emerald-200/80 bg-emerald-50/70 hover:bg-emerald-50 dark:border-emerald-900/35 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20`;
  }
  if (status === "uploading") {
    return `${base} border-orange-200/80 bg-orange-50/70 shadow-sm shadow-orange-500/5 dark:border-orange-900/35 dark:bg-orange-900/10`;
  }
  if (status === "error") {
    return `${base} border-red-200/80 bg-red-50/70 hover:bg-red-50 dark:border-red-900/35 dark:bg-red-900/10 dark:hover:bg-red-900/20`;
  }
  return `${base} border-(--border) bg-(--bg-2) hover:bg-gray-50 dark:hover:bg-zinc-800/70`;
}

function fileIconShellClass(status: FileStatus) {
  if (status === "done") return "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-900/25 dark:ring-emerald-900/40";
  if (status === "uploading") return "bg-orange-100 text-orange-600 ring-1 ring-orange-200 dark:bg-orange-900/25 dark:ring-orange-900/40";
  if (status === "error") return "bg-red-100 text-red-600 ring-1 ring-red-200 dark:bg-red-900/25 dark:ring-red-900/40";
  return "bg-white shadow-sm dark:bg-zinc-800";
}

function UploadStatusPill({ status, progress }: { status: FileStatus; progress: number }) {
  if (status === "done") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-bold text-white shadow-sm shadow-emerald-500/20">
        <CheckCircle size={10} /> Uploaded
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500 px-2 py-1 text-[10px] font-bold text-white shadow-sm shadow-red-500/20">
        <AlertCircle size={10} /> Failed
      </span>
    );
  }

  if (status === "uploading") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-500 px-2 py-1 text-[10px] font-bold tabular-nums text-white shadow-sm shadow-orange-500/20">
        <CloudUpload size={10} className="animate-pulse" />
        <SmoothProgressText value={progress} />
      </span>
    );
  }

  return null;
}

/* ──────────────────────────────────────────
   Section header
────────────────────────────────────────── */
function SectionHeader({ step, label, icon }: { step: number; label: string; icon: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[11px] font-bold text-white shadow-sm shadow-orange-500/40">
        {step}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-orange-500">{icon}</span>
        <span className="text-sm font-bold text-(--text)">{label}</span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   Summary row
────────────────────────────────────────── */
function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2.5">
      <span className="shrink-0 text-xs text-(--text-muted)">{label}</span>
      <span className="min-w-0 break-words text-right text-xs font-semibold text-(--text)">{value}</span>
    </div>
  );
}

/* ──────────────────────────────────────────
   Step dot
────────────────────────────────────────── */
function StepDot({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={[
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300",
        done   ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30" :
        active ? "bg-orange-500 text-white shadow-sm shadow-orange-500/30" :
                 "bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500",
      ].join(" ")}>
        {done ? <Check size={13} strokeWidth={2.5} /> : n}
      </div>
      <span className={[
        "hidden text-xs font-semibold sm:block transition-colors",
        done || active ? "text-(--text)" : "text-(--text-muted)",
      ].join(" ")}>{label}</span>
    </div>
  );
}

/* ══════════════════════════════════════════
   PAGE
══════════════════════════════════════════ */
export default function SendPage() {
  const [files, setFiles]       = useState<SendFile[]>([]);
  /** Files already in storage, pre-selected from the Files page */
  const [preloadedFiles, setPreloadedFiles] = useState<PreloadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const folderRefCallback = useCallback((node: HTMLInputElement | null) => {
    folderInputRef.current = node;
    if (node) {
      node.setAttribute("webkitdirectory", "");
      node.setAttribute("mozdirectory", "");
    }
  }, []);

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  function toggleFolder(name: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const [method, setMethod] = useState<SendMethod>("email");
  const [title, setTitle]           = useState("");
  const [emails, setEmails]         = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [subject, setSubject]       = useState("");
  const [message, setMessage]       = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword]               = useState("");
  const [showPassword, setShowPassword]       = useState(false);
  const [expiresAt, setExpiresAt]             = useState(() => getPresetExpiryValue("1-day"));
  const [expiryPreset, setExpiryPreset]       = useState<ExpiryPreset | null>("1-day");
  const [sendPhase, setSendPhase]     = useState<SendPhase>("idle");
  const [sentSuccess, setSentSuccess] = useState(false);
  const [completedTransfer, setCompletedTransfer] = useState<CompletedTransferSummary | null>(null);
  const [generatedLink, setGeneratedLink] = useState("");
  const [linkCopied, setLinkCopied]   = useState(false);
  const [qrDownloading, setQrDownloading] = useState(false);

  const [showPicker, setShowPicker] = useState(false);

  const [stats, setStats] = useState<TransferStats>({
    totalTransfers: 0, selfTransfers: 0, totalUsers: 0,
    receivedMails: 0, starredMails: 0, activeLinks: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [recent, setRecent]               = useState<Transfer[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  /* Read files pre-selected on the Files page (stored in sessionStorage by FileCard/handleSendSelected) */
  useEffect(() => {
    const raw = sessionStorage.getItem("pending_send");
    if (raw) {
      sessionStorage.removeItem("pending_send");
      try {
        const parsed: Partial<PreloadedFile>[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          queueMicrotask(() => {
            setPreloadedFiles(
              parsed
                .map(normalizePreloadedFile)
                .filter((file): file is PreloadedFile => file !== null),
            );
          });
        }
      } catch { /* ignore malformed data */ }
    }
    loadStats();
    loadRecent();
  }, []);

  async function loadStats() {
    try {
      setStatsLoading(true);
      const res = await transfersApi.getStats();
      const d   = res.data?.data ?? res.data ?? {};
      setStats({
        totalTransfers: d.totalTransfers ?? 0,
        selfTransfers:  d.selfTransfers  ?? 0,
        totalUsers:     d.totalUsers     ?? 0,
        receivedMails:  d.receivedMails  ?? 0,
        starredMails:   d.starredMails   ?? 0,
        activeLinks:    d.activeLinks    ?? 0,
      });
    } catch { /* API not ready */ } finally { setStatsLoading(false); }
  }

  async function loadRecent() {
    try {
      setRecentLoading(true);
      const res = await transfersApi.list({ limit: 10 });
      setRecent(getTransfersFromResponse(res.data));
    } catch { /* empty */ } finally { setRecentLoading(false); }
  }

  function addRawFiles(items: { file: File; relativePath?: string }[]) {
    const validSize = items.filter(({ file }) => file.size <= UPLOAD_LIMITS.MAX_FILE_BYTES);
    const rejected = items.length - validSize.length;

    if (rejected > 0) {
      showToast.error(`${rejected} file${rejected !== 1 ? "s" : ""} skipped. Max size is ${formatBytes(UPLOAD_LIMITS.MAX_FILE_BYTES)} per file.`);
    }

    if (validSize.length === 0) return;

    setFiles((prev) => {
      const existing = new Set(prev.map((sf) => fileIdentity(sf.file, sf.relativePath)));
      const accepted: { file: File; relativePath?: string }[] = [];
      let duplicateCount = 0;
      let skippedForBatchSize = 0;
      let runningSize = prev.reduce((sum, sf) => sum + sf.file.size, 0) +
        preloadedFiles.reduce((sum, file) => sum + file.size, 0);

      for (const item of validSize) {
        const identity = fileIdentity(item.file, item.relativePath);
        if (existing.has(identity)) {
          duplicateCount += 1;
          continue;
        }
        if (runningSize + item.file.size > UPLOAD_LIMITS.MAX_BATCH_BYTES) {
          skippedForBatchSize += 1;
          continue;
        }

        existing.add(identity);
        runningSize += item.file.size;
        accepted.push(item);
      }

      if (duplicateCount > 0) {
        showToast.error(`${duplicateCount} duplicate file${duplicateCount !== 1 ? "s" : ""} skipped.`);
      }
      if (skippedForBatchSize > 0) {
        showToast.error(`${skippedForBatchSize} file${skippedForBatchSize !== 1 ? "s" : ""} skipped. Batch max is ${formatBytes(UPLOAD_LIMITS.MAX_BATCH_BYTES)}.`);
      }
      if (accepted.length === 0) return prev;

      const next = [
        ...prev,
        ...accepted.map(({ file, relativePath }) => ({
          id: crypto.randomUUID(),
          file,
          progress: 0,
          uploadedBytes: 0,
          status: "idle" as FileStatus,
          relativePath,
        })),
      ];
      /* Auto-suggest a title from the first file when none has been set */
      if (prev.length === 0 && accepted.length > 0) {
        setTitle((t) => t || accepted[0].file.name.replace(/\.[^/.]+$/, ""));
      }
      return next;
    });
  }

  const onFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addRawFiles(Array.from(e.target.files).map((f) => ({ file: f })));
    e.target.value = "";
  };

  const onFolderSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addRawFiles(Array.from(e.target.files).map((f) => ({
      file: f, relativePath: f.webkitRelativePath || f.name,
    })));
    e.target.value = "";
  };

  const onDragOver  = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
  }, []);

  const onDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    try {
      const items = Array.from(e.dataTransfer.items);
      const entries = items
        .map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.() ?? null)
        .filter((entry): entry is FileSystemEntry => entry !== null);
      if (entries.length > 0) {
        const collected: { file: File; relativePath: string }[] = [];
        await pool(
          entries.map((entry) => () => traverseEntry(entry, "", collected)),
          FOLDER_TRAVERSAL_CONCURRENCY,
        );
        if (collected.length > 0) addRawFiles(collected);
      } else {
        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length > 0) addRawFiles(droppedFiles.map((f) => ({ file: f })));
      }
    } catch (err) {
      showToast.error((err as Error)?.message || "Could not read dropped files");
    }
  }, []);

  function patchFile(id: string, patch: Partial<SendFile>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  const addEmail = () => {
    const { valid, invalid } = parseRecipientEmails(emailInput);
    if (invalid.length > 0) {
      showToast.error(`Enter a valid email address${invalid.length > 1 ? "es" : ""}`);
      return;
    }
    if (valid.length === 0) return;
    setEmails((previous) => {
      const existing = new Set(previous.map((email) => email.toLowerCase()));
      return [...previous, ...valid.filter((email) => !existing.has(email.toLowerCase()))];
    });
    setEmailInput("");
  };
  const onEmailKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addEmail(); }
  };

  async function copyLink() {
    await navigator.clipboard.writeText(generatedLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function shareGeneratedLink() {
    if (!generatedLink || !navigator.share) return;
    try {
      await navigator.share({
        title: title.trim() || "Secure file transfer",
        text: transferShareText(generatedLink),
        url: generatedLink,
      });
    } catch {
      /* User cancelled native share sheet. */
    }
  }

  async function downloadQrCode() {
    const qrLink = completedTransfer?.link || generatedLink;
    if (!qrLink) return;
    const url = qrImageUrl(qrLink, 640);
    setQrDownloading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("QR download failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${(completedTransfer?.title || title || "transfer").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "transfer"}-qr.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setQrDownloading(false);
    }
  }

  const canSend = () => {
    if (files.length === 0 && preloadedFiles.length === 0) return false;
    if (method === "email" && emails.length === 0) return false;
    if (passwordEnabled && !password) return false;
    if (getExpiryError(expiresAt)) return false;
    return true;
  };

  async function uploadFile(sf: SendFile): Promise<{ key: string; fileId: string; uploadSessionId?: string } | null> {
    try {
      patchFile(sf.id, { status: "uploading", progress: 0, uploadedBytes: 0 });
      const res = await uploadApi.uploadFile(
        sf.file,
        undefined,
        (progress, loadedBytes) =>
          patchFile(sf.id, {
            progress,
            uploadedBytes: Math.min(loadedBytes, sf.file.size),
          }),
      );
      const d = (res.data?.data ?? res.data ?? {}) as UploadResponseData;
      const fileId =
        d?.file?._id?.toString() ?? d?.file?.id?.toString() ??
        d?._id?.toString() ?? d?.id?.toString() ?? d?.fileId?.toString();
      const key = d?.file?.key ?? d?.key ?? "";
      const uploadSessionId =
        d?.file?.uploadSessionId?.toString?.() ??
        d?.uploadSessionId?.toString?.();
      if (!fileId) {
        if (process.env.NODE_ENV === "development")
          console.error("[SendPage] uploadFile: unexpected response shape", res.data);
        throw new Error("Upload succeeded but server returned no file ID");
      }
      patchFile(sf.id, { status: "done", progress: 100, uploadedBytes: sf.file.size, key, fileId });
      return { key, fileId, uploadSessionId };
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ?? "Upload failed";
      patchFile(sf.id, { status: "error", error: msg });
      return null;
    }
  }

  async function handleSend() {
    if (!canSend()) return;
    try {
      setSendPhase("uploading");
      const uploadConcurrency = getUploadFileConcurrency(files, totalSize);
      /* Upload new files with dynamic concurrency; large multipart files already upload parts in parallel. */
      const results = files.length > 0
        ? await pool(files.map((sf) => () => uploadFile(sf)), uploadConcurrency)
        : [];
      const failed = results.filter((r) => r === null).length;
      if (failed > 0) {
        showToast.error(`${failed} file(s) failed to upload. Fix errors and try again.`);
        setSendPhase("idle");
        return;
      }
      setSendPhase("creating");
      const uploaded = results as { key: string; fileId: string; uploadSessionId?: string }[];
      const resolvedTitle = title.trim()
        || files[0]?.file.name.replace(/\.[^/.]+$/, "")
        || preloadedFiles[0]?.name.replace(/\.[^/.]+$/, "")
        || "Transfer";

      /* Build fileId → relativePath map for locally-uploaded folder files */
      const relativePaths: Record<string, string> = {};
      preloadedFiles.forEach((file) => {
        if (file.relativePath?.includes("/")) relativePaths[file.id] = file.relativePath;
      });
      files.forEach((sf, i) => {
        const rp = sf.relativePath;
        const fid = uploaded[i]?.fileId;
        if (rp && fid && rp.includes("/")) relativePaths[fid] = rp;
      });

      const payload: SendPayload = {
        title: resolvedTitle,
        /* Existing library files are resolved by ID. Newly uploaded local files
           are resolved by their backend-verified storage key, avoiding a bulk
           transfer failure when an upload response contains a stale/aliased ID. */
        fileIds: [
          ...preloadedFiles.filter((file) => !file.key).map((file) => file.id),
          ...uploaded.filter((file) => !file.key).map((file) => file.fileId),
        ].filter(Boolean),
        fileKeys: [
          ...preloadedFiles.map((file) => file.key),
          ...uploaded.map((file) => file.key),
        ].filter((key): key is string => Boolean(key)),
        ...(Object.keys(relativePaths).length > 0 ? { relativePaths } : {}),
        totalSize:  totalSize,
        fileCount:  totalFileCount,
        folderCount: folderCount,
        method,
        expiresAt: new Date(expiresAt).toISOString(),
        ...(passwordEnabled && password ? { password } : {}),
        ...(method === "email" ? { recipients: emails, ...(subject ? { subject } : {}), ...(message ? { message } : {}) } : {}),
      };

      let res;
      try {
        res = await transfersApi.send(payload);
      } catch (err) {
        const msg = getErrorMessage(err);
        const canRetryQrAsLink =
          method === "qr" &&
          /(?:qr.{0,30}(?:unsupported|invalid|not allowed)|method.{0,50}qr)/i.test(msg);
        const canRetryWithKeys =
          preloadedFiles.length === 0 &&
          uploaded.length > 0 &&
          uploaded.every((file) => file.key) &&
          msg.includes("not found or are not available to send");

        if (!canRetryWithKeys && !canRetryQrAsLink) throw err;

        const keyOnlyPayload: SendPayload = {
          ...payload,
          ...(canRetryWithKeys
            ? {
                fileIds: [],
                fileKeys: uploaded.map((file) => file.key).filter(Boolean),
              }
            : {}),
          ...(canRetryQrAsLink ? { method: "link" } : {}),
        };

        if (process.env.NODE_ENV === "development") {
          console.warn("[SendPage] Retrying transfer creation", {
            reason: canRetryQrAsLink ? "qr-as-link" : "uploaded-file-keys",
            fileIds: payload.fileIds,
            fileKeys: keyOnlyPayload.fileKeys,
            method: keyOnlyPayload.method,
          });
        }

        res = await transfersApi.send(keyOnlyPayload);
      }
      const resData    = (res.data?.data ?? res.data) as SendTransferResponse;
      const createdTransfer = (resData.transfer ?? resData) as Transfer;
      const transferId = createdTransfer?.id ?? resData?._id ?? "";
      const linkObject = typeof resData?.link === "object" ? resData.link : createdTransfer?.link;
      const shortCode  = linkObject?.shortCode ?? resData?.shortCode ?? "";
      const linkUrl    = linkObject?.url ?? (typeof resData?.link === "string" ? resData.link : null);
      const link = linkUrl
        ?? (shortCode  ? `${window.location.origin}/t/${shortCode}` : null)
        ?? (transferId ? `${window.location.origin}/t/${transferId}` : "");
      notifyAppDataChanged({
        source: "transfer",
        files: uploaded.length > 0,
        folders: Object.keys(relativePaths).length > 0,
        storage: uploaded.length > 0,
        transfers: true,
      });
      setGeneratedLink(link);
      setCompletedTransfer({
        method,
        title: resolvedTitle,
        recipients: method === "email" ? [...emails] : [],
        totalFileCount,
        totalSize,
        link,
      });
      setSendPhase("done");
      setSentSuccess(true);
      if (transferId) {
        setRecent((prev) => {
          const optimistic: Transfer = {
            ...createdTransfer,
            id: transferId,
            title: createdTransfer.title ?? resolvedTitle,
            method,
            files: createdTransfer.files ?? [],
            totalSize: createdTransfer.totalSize ?? totalSize,
            fileCount: createdTransfer.fileCount ?? totalFileCount,
            folderCount: createdTransfer.folderCount ?? folderCount,
            recipients: createdTransfer.recipients ?? emails,
            senderId: createdTransfer.senderId ?? "",
            privacy: createdTransfer.privacy ?? "public",
            status: createdTransfer.status ?? "active",
            hasPassword: createdTransfer.hasPassword ?? passwordEnabled,
            views: createdTransfer.views ?? 0,
            downloads: createdTransfer.downloads ?? 0,
            createdAt: createdTransfer.createdAt ?? new Date().toISOString(),
            updatedAt: createdTransfer.updatedAt ?? new Date().toISOString(),
            link: linkObject ?? createdTransfer.link,
          };
          return [optimistic, ...prev.filter((item) => item.id !== transferId)].slice(0, 10);
        });
      }
      setStats((prev) => ({
        ...prev,
        totalTransfers: prev.totalTransfers + 1,
        selfTransfers: prev.selfTransfers + 1,
        activeLinks: method === "email" && !link ? prev.activeLinks : prev.activeLinks + 1,
      }));
      void loadStats();
      void loadRecent();
    } catch (err) {
      handleApiError(err);
      setSendPhase("idle");
    }
  }

  function resetForm() {
    setFiles([]); setPreloadedFiles([]); setEmails([]); setEmailInput("");
    setTitle(""); setSubject(""); setMessage("");
    setPasswordEnabled(false); setPassword("");
    setExpiresAt(getPresetExpiryValue("1-day")); setExpiryPreset("1-day");
    setCompletedTransfer(null);
    setGeneratedLink(""); setSentSuccess(false); setSendPhase("idle");
  }

  function handlePickerConfirm(picked: PickedFile[]) {
    const existingIds = new Set(preloadedFiles.map((f) => f.id));
    const newOnes = picked.filter((f) => !existingIds.has(f.id));
    if (newOnes.length === 0) return;
    setPreloadedFiles((prev) => [...prev, ...newOnes]);
    if (preloadedFiles.length === 0 && files.length === 0 && newOnes.length > 0) {
      setTitle((t) => t || newOnes[0].name.replace(/\.[^/.]+$/, ""));
    }
  }

  /* ── Derived ── */
  const isSending       = sendPhase === "uploading" || sendPhase === "creating";
  const totalSize       = files.reduce((s, f) => s + f.file.size, 0)
                        + preloadedFiles.reduce((s, f) => s + f.size, 0);
  const uploadTotalSize = files.reduce((s, f) => s + f.file.size, 0);
  const uploadedBytes   = files.reduce((s, f) => {
    if (f.status === "done") return s + f.file.size;
    return s + Math.min(f.uploadedBytes || 0, f.file.size);
  }, 0);
  const totalFileCount  = files.length + preloadedFiles.length;
  const uploadedCount   = files.filter((f) => f.status === "done").length;
  const errorCount      = files.filter((f) => f.status === "error").length;
  const alreadySelectedIds = useMemo(
    () => new Set(preloadedFiles.map((f) => f.id)),
    [preloadedFiles],
  );

  const folderCount = useMemo(() => {
    const paths = new Set<string>();
    preloadedFiles.forEach((f) => {
      const rp = f.relativePath;
      if (!rp?.includes("/")) return;
      const parts = rp.split("/");
      for (let i = 1; i < parts.length; i++) paths.add(parts.slice(0, i).join("/"));
    });
    files.forEach((f) => {
      const rp = f.relativePath;
      if (!rp?.includes("/")) return;
      const parts = rp.split("/");
      for (let i = 1; i < parts.length; i++) paths.add(parts.slice(0, i).join("/"));
    });
    return paths.size;
  }, [files, preloadedFiles]);
  const overallProgress = uploadTotalSize === 0 ? 0
    : Math.min(100, Math.round((uploadedBytes * 100) / uploadTotalSize));
  const uploadDisplayProgress = sendPhase === "creating" || files.length === 0 ? 100 : overallProgress;
  const smoothUploadProgress = useSmoothProgress(uploadDisplayProgress, isSending);
  const expiryError = getExpiryError(expiresAt);
  const currentMethod   = METHODS.find((m) => m.key === method)!;
  const successSummary = completedTransfer ?? {
    method,
    title: title.trim() || "Transfer",
    recipients: emails,
    totalFileCount,
    totalSize,
    link: generatedLink,
  };
  const successMethod = successSummary.method;
  const showGeneratedLink = Boolean(successSummary.link) && successMethod !== "email";
  const showShareOptions = Boolean(successSummary.link) && successMethod !== "email";

  const folderGroups: Record<string, SendFile[]> = {};
  const rootFiles: SendFile[] = [];
  files.forEach((f) => {
    if (f.relativePath?.includes("/")) {
      const folder = f.relativePath.split("/")[0];
      (folderGroups[folder] ??= []).push(f);
    } else {
      rootFiles.push(f);
    }
  });

  const step1Done   = totalFileCount > 0 && !isSending;
  const step2Done   = step1Done && (method !== "email" || emails.length > 0);
  const step3Active = step2Done;

  const STAT_CARDS = [
    { label: "Total Transfers", value: stats.totalTransfers, icon: <Send size={16} />,        gradient: "from-orange-500 to-amber-500"  },
    { label: "Self Transfers",  value: stats.selfTransfers,  icon: <RefreshCw size={16} />,   gradient: "from-purple-500 to-violet-500" },
    { label: "Total Users",     value: stats.totalUsers,     icon: <Users size={16} />,       gradient: "from-blue-500 to-blue-600"     },
    { label: "Received",        value: stats.receivedMails,  icon: <Inbox size={16} />,       gradient: "from-emerald-500 to-green-600" },
    { label: "Starred",         value: stats.starredMails,   icon: <Star size={16} />,        gradient: "from-amber-500 to-yellow-500"  },
    { label: "Active Links",    value: stats.activeLinks,    icon: <LinkIcon size={16} />,    gradient: "from-sky-500 to-cyan-500"      },
  ];

  /* ── Input base class ── */
  const inputCls = (accent = "orange") =>
    `h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-(--text) outline-none transition-all placeholder:text-gray-400 focus:border-${accent}-400 focus:ring-3 focus:ring-${accent}-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:border-${accent}-500`;

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in w-full min-w-0 max-w-full space-y-5 overflow-x-hidden pb-16">

          {/* ══════════════════════════════════════
              HERO HEADER
          ══════════════════════════════════════ */}
          <div className="relative max-w-full overflow-hidden rounded-2xl border border-orange-200/50 bg-linear-to-br from-orange-50 via-amber-50/40 to-white px-4 py-5 sm:px-6 sm:py-7 dark:border-orange-900/20 dark:from-orange-950/25 dark:via-amber-900/10 dark:to-zinc-900/0">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-orange-400/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-10 left-20 h-40 w-40 rounded-full bg-amber-400/8 blur-2xl" />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-orange-500 to-amber-500 text-white shadow-xl shadow-orange-500/25">
                  <Send size={24} />
                  <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm dark:bg-zinc-900">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-xl font-extrabold tracking-tight text-(--text)">Send Files</h1>
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/12 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                      <Sparkles size={9} /> R2 Powered
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-(--text-muted)">
                    Transfer files via email, link, QR code or social — end-to-end encrypted
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex items-center gap-1 text-[11px] text-(--text-muted)">
                      <Shield size={10} className="text-emerald-500" /> Encrypted
                    </span>
                    <span className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                    <span className="flex items-center gap-1 text-[11px] text-(--text-muted)">
                      <CloudUpload size={10} className="text-sky-500" /> Cloudflare R2
                    </span>
                    <span className="h-3 w-px bg-gray-200 dark:bg-zinc-700" />
                    <span className="flex items-center gap-1 text-[11px] text-(--text-muted)">
                      <Zap size={10} className="text-amber-500" /> Up to {formatBytes(UPLOAD_LIMITS.MAX_FILE_BYTES)}
                    </span>
                  </div>
                </div>
              </div>

              {!sentSuccess && (
                <div className="flex w-full min-w-0 items-center justify-between gap-1 rounded-2xl border border-gray-200/80 bg-white/80 px-3 py-3 shadow-sm backdrop-blur-sm sm:w-auto sm:shrink-0 sm:justify-start sm:gap-2 sm:px-4 dark:border-zinc-700/60 dark:bg-zinc-900/80">
                  <StepDot n={1} label="Files" active={totalFileCount === 0} done={step1Done} />
                  <div className="h-px min-w-3 flex-1 bg-gray-200 sm:w-6 sm:flex-none dark:bg-zinc-700" />
                  <StepDot n={2} label="Configure" active={step1Done && !step2Done} done={step2Done} />
                  <div className="h-px min-w-3 flex-1 bg-gray-200 sm:w-6 sm:flex-none dark:bg-zinc-700" />
                  <StepDot n={3} label="Send" active={step3Active} done={sentSuccess} />
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════
              STATS GRID
          ══════════════════════════════════════ */}
          {/* <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {STAT_CARDS.map((s) => (
              <div key={s.label}
                className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900">
                <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 translate-x-6 -translate-y-6 rounded-full bg-gray-50 dark:bg-zinc-800/50" />
                <div className={`relative mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br ${s.gradient} text-white shadow-sm`}>
                  {s.icon}
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">{s.label}</p>
                {statsLoading
                  ? <div className="mt-1.5 h-5 w-12 animate-pulse rounded-md bg-gray-100 dark:bg-zinc-800" />
                  : <p className="mt-0.5 text-lg font-bold text-(--text)">{s.value.toLocaleString()}</p>}
                <TrendingUp size={10} className="absolute bottom-3 right-3 text-gray-200 dark:text-zinc-700" />
              </div>
            ))}
          </div> */}

          {/* ══════════════════════════════════════
              SUCCESS STATE
          ══════════════════════════════════════ */}
          {sentSuccess ? (
            <div className="overflow-hidden rounded-2xl border border-[rgb(73,140,1)]/25 bg-white shadow-xl shadow-[rgb(73,140,1)]/10 sm:rounded-3xl dark:border-[rgb(73,140,1)]/30 dark:bg-zinc-950">
              <div className="flex flex-col">
                <div className="relative overflow-hidden bg-linear-to-br from-green-50 via-white to-orange-50 px-4 py-5 text-slate-900 sm:px-6 sm:py-6 dark:from-green-950/35 dark:via-zinc-900 dark:to-orange-950/25 dark:text-white">
                  <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-[rgb(73,140,1)] via-lime-500 to-orange-400" />
                  <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full border border-[rgb(73,140,1)]/15 bg-green-100/40 dark:border-white/10 dark:bg-green-900/10" />
                  <div className="pointer-events-none absolute -bottom-20 -left-12 h-52 w-52 rounded-full border border-orange-300/20 bg-orange-100/30 dark:border-orange-500/10 dark:bg-orange-900/10" />

                  <div className="relative grid gap-5 md:grid-cols-[1fr_18rem] md:items-end">
                    <div>
                      <div className="mb-4 flex items-center justify-between gap-4">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[rgb(62,120,1)] shadow-sm ring-1 ring-green-100 dark:bg-zinc-900 dark:text-lime-400 dark:ring-green-900/40">
                          <Shield size={13} /> Secure delivery
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-100 text-orange-500 ring-1 ring-orange-200 dark:bg-orange-900/20 dark:ring-orange-900/40">
                          <Sparkles size={17} />
                        </div>
                      </div>

                      <div className="relative mb-4 w-fit">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgb(73,140,1)] text-white shadow-xl shadow-green-700/25 sm:h-16 sm:w-16">
                          {successMethod === "email"
                            ? <Mail size={28} />
                            : successMethod === "qr"
                              ? <QrCode size={28} />
                              : <LinkIcon size={28} />}
                        </div>
                        <div className="absolute -right-2 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-orange-400 text-white shadow-lg">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      </div>

                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[rgb(73,140,1)] dark:text-lime-400">
                        Transfer complete
                      </p>
                      <h2 className="max-w-md text-2xl font-black tracking-tight sm:text-3xl">
                        {successMethod === "email"
                          ? "Email sent successfully!"
                          : successMethod === "qr"
                            ? "QR code is ready!"
                            : "Share link is ready!"}
                      </h2>
                      <p className="mt-2 max-w-xl text-sm leading-5 text-slate-600 dark:text-zinc-300">
                        {successSummary.totalFileCount} file{successSummary.totalFileCount !== 1 ? "s" : ""} totaling {formatBytes(successSummary.totalSize)}
                        {successMethod === "email"
                          ? ` delivered to ${successSummary.recipients.length} recipient${successSummary.recipients.length !== 1 ? "s" : ""}.`
                          : successMethod === "qr"
                            ? " is ready as a scannable QR code."
                            : " is ready to share with a secure link."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-green-100 dark:bg-zinc-900 dark:ring-green-900/30">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[rgb(73,140,1)] dark:text-lime-400">Files</p>
                        <p className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">{successSummary.totalFileCount}</p>
                      </div>
                      <div className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-green-100 dark:bg-zinc-900 dark:ring-green-900/30">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[rgb(73,140,1)] dark:text-lime-400">Size</p>
                        <p className="mt-0.5 truncate text-lg font-black text-slate-900 dark:text-white">{formatBytes(successSummary.totalSize)}</p>
                      </div>
                      <div className="col-span-2 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-orange-100 dark:bg-zinc-900 dark:ring-orange-900/30">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Method</p>
                        <div className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                          {successMethod === "email" ? <Mail size={15} /> : successMethod === "qr" ? <QrCode size={15} /> : <LinkIcon size={15} />}
                          {successMethod === "email" ? "Email delivery" : successMethod === "qr" ? "QR code" : "Shareable link"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
                  {successMethod === "email" && (
                    <div className="overflow-hidden rounded-2xl border border-[rgb(73,140,1)]/25 bg-green-50/70 dark:border-[rgb(73,140,1)]/30 dark:bg-green-950/10">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(73,140,1)]/20 bg-white/70 px-4 py-3 dark:border-[rgb(73,140,1)]/25 dark:bg-zinc-900/50">
                        <div className="flex items-center gap-2 text-sm font-bold text-[rgb(62,120,1)] dark:text-lime-400">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(73,140,1)] text-white shadow-sm shadow-green-700/25">
                            <Mail size={15} />
                          </span>
                          Email delivery
                        </div>
                        <span className="rounded-full bg-lime-100 px-2.5 py-1 text-[11px] font-bold text-[rgb(62,120,1)] ring-1 ring-lime-200 dark:bg-lime-900/20 dark:text-lime-300 dark:ring-lime-900/40">
                          {successSummary.recipients.length} sent
                        </span>
                      </div>
                      <div className="grid gap-2 p-3 sm:grid-cols-2">
                        {successSummary.recipients.map((recipient) => (
                          <div key={recipient} className="flex min-w-0 items-center gap-3 rounded-xl border border-green-100 bg-white px-3 py-2.5 shadow-sm dark:border-green-900/30 dark:bg-zinc-900">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-50 text-[rgb(73,140,1)] dark:bg-green-900/20 dark:text-lime-400">
                              <Check size={13} />
                            </span>
                            <span className="min-w-0 truncate text-sm font-semibold text-(--text)">{recipient}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {successMethod === "qr" && successSummary.link && (
                    <div className="grid gap-3 rounded-2xl border border-[rgb(73,140,1)]/25 bg-linear-to-br from-green-50 via-lime-50/60 to-orange-50 p-3 dark:border-[rgb(73,140,1)]/30 dark:from-green-950/20 dark:via-lime-950/10 dark:to-zinc-900 sm:grid-cols-[128px_1fr] sm:items-center">
                      <div className="mx-auto flex aspect-square w-full max-w-32 items-center justify-center rounded-xl border-4 border-white bg-white p-2 shadow-xl shadow-green-700/15 dark:border-zinc-800">
                        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic QR service URL is not in the image allowlist */}
                        <img
                          src={qrImageUrl(successSummary.link, 320)}
                          alt="Transfer QR code"
                          className="h-full w-full"
                        />
                      </div>
                      <div className="flex flex-col justify-center text-center sm:text-left">
                        <div className="mb-2 inline-flex w-fit items-center gap-2 self-center rounded-full bg-white px-3 py-1 text-xs font-bold text-[rgb(62,120,1)] ring-1 ring-green-100 dark:bg-zinc-900 dark:text-lime-400 dark:ring-green-900/40 sm:self-start">
                          <QrCode size={13} /> QR code ready
                        </div>
                        <p className="text-sm leading-6 text-(--text-muted)">
                          Scan-ready access for in-person sharing or printed handoff.
                        </p>
                        <button type="button" onClick={downloadQrCode} disabled={qrDownloading}
                          className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[rgb(73,140,1)] text-sm font-bold text-white shadow-lg shadow-green-700/20 transition-colors hover:bg-[rgb(62,120,1)] disabled:cursor-not-allowed disabled:opacity-60">
                          {qrDownloading ? <Spinner size={15} /> : <Download size={15} />} Download QR
                        </button>
                      </div>
                    </div>
                  )}

                  {showGeneratedLink && (
                    <div className="min-w-0 overflow-hidden rounded-2xl border border-[rgb(73,140,1)]/25 bg-white shadow-sm shadow-green-700/10 dark:border-[rgb(73,140,1)]/30 dark:bg-zinc-900">
                      <div className="flex min-w-0 items-center gap-3 bg-green-50/80 px-3 py-3 sm:px-4 dark:bg-green-950/15">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(73,140,1)] text-white shadow-sm shadow-green-700/25">
                          <LinkIcon size={16} />
                        </span>
                        <a href={successSummary.link} target="_blank" rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-[rgb(62,120,1)] hover:underline dark:text-lime-400">
                          {successSummary.link}
                        </a>
                      </div>
                      <div className="flex divide-x divide-green-100 border-t border-green-100 dark:divide-green-900/30 dark:border-green-900/30">
                        <button type="button" onClick={copyLink}
                          className="flex flex-1 items-center justify-center gap-2 py-3 text-xs font-bold text-[rgb(62,120,1)] transition-colors hover:bg-green-50 dark:text-lime-400 dark:hover:bg-green-900/20">
                          {linkCopied
                              ? <><Check size={12} className="text-[rgb(73,140,1)]" /> Copied!</>
                            : <><Copy size={12} /> Copy Link</>}
                        </button>
                        <button type="button"
                          onClick={() => window.open(successSummary.link, "_blank", "noopener,noreferrer")}
                          className="flex flex-1 items-center justify-center gap-2 py-3 text-xs font-bold text-[rgb(62,120,1)] transition-colors hover:bg-green-50 dark:text-lime-400 dark:hover:bg-green-900/20">
                          <ExternalLink size={12} /> Open
                        </button>
                      </div>
                    </div>
                  )}

                  {showShareOptions && (
                    <details className="group rounded-xl border border-[rgb(73,140,1)]/20 bg-green-50/50 dark:border-[rgb(73,140,1)]/30 dark:bg-green-950/10">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-(--text) [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center gap-2">
                          <Share2 size={15} className="text-[rgb(73,140,1)]" /> Share options
                        </span>
                        <ChevronDown size={16} className="text-[rgb(73,140,1)] transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="grid grid-cols-1 gap-2 border-t border-green-100 p-3 sm:grid-cols-2 lg:grid-cols-3 dark:border-green-900/30">
                        {successMethod === "link" && (
                          <button
                            type="button"
                            onClick={downloadQrCode}
                            disabled={qrDownloading}
                            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-green-200 bg-white text-sm font-bold text-[rgb(62,120,1)] transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-900/40 dark:bg-zinc-950 dark:text-lime-400 dark:hover:bg-green-900/20"
                          >
                            {qrDownloading ? <Spinner size={15} /> : <QrCode size={15} />} QR Code
                          </button>
                        )}
                        <a
                          href={shareHref("email", successSummary.link)}
                          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-green-200 bg-white text-sm font-bold text-[rgb(62,120,1)] transition-colors hover:bg-green-100 dark:border-green-900/40 dark:bg-zinc-950 dark:text-lime-400 dark:hover:bg-green-900/20"
                        >
                          <Mail size={15} /> Email Link
                        </a>
                        <a
                          href={shareHref("whatsapp", successSummary.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-green-200 bg-white text-sm font-bold text-[rgb(62,120,1)] transition-colors hover:bg-green-100 dark:border-green-900/40 dark:bg-zinc-950 dark:text-lime-400 dark:hover:bg-green-900/20"
                        >
                          <MessageCircle size={15} /> WhatsApp
                        </a>
                        <a
                          href={shareHref("sms", successSummary.link)}
                          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-green-200 bg-white text-sm font-bold text-[rgb(62,120,1)] transition-colors hover:bg-green-100 dark:border-green-900/40 dark:bg-zinc-950 dark:text-lime-400 dark:hover:bg-green-900/20"
                        >
                          <Smartphone size={15} /> SMS
                        </a>
                        <button
                          type="button"
                          onClick={shareGeneratedLink}
                          disabled={typeof navigator === "undefined" || !navigator.share}
                          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 text-sm font-bold text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-orange-900/40 dark:bg-orange-900/20 dark:text-orange-300"
                        >
                          <Share2 size={15} /> Share
                        </button>
                      </div>
                    </details>
                  )}

                  <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-(--text-muted)">
                      Your transfer is saved and ready from the transfers view.
                    </p>
                    <Button variant="secondary" onClick={resetForm} leftIcon={<RefreshCw size={14} />} rounded="full">
                      Send More Files
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ══════════════════════════════════════
                COMPOSER
            ══════════════════════════════════════ */
            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">

              {/* ── Left column ── */}
              <div className="min-w-0 space-y-4">

                {/* Upload progress banner */}
                {isSending && (
                  <div className="overflow-hidden rounded-xl border border-orange-200/70 bg-orange-50 dark:border-orange-900/30 dark:bg-orange-900/10">
                    <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/15">
                          <CloudUpload size={15} className="animate-pulse text-orange-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">
                            {sendPhase === "uploading" && files.length > 0
                              ? `Uploading files… ${uploadedCount} of ${files.length} done`
                              : "Creating transfer record…"}
                          </p>
                          <p className="text-[11px] text-orange-600/70 dark:text-orange-400/70">
                            {sendPhase === "uploading" && files.length > 0
                              ? `${formatBytes(uploadedBytes)} of ${formatBytes(uploadTotalSize)} uploaded · Cloudflare R2`
                              : "Almost there…"}
                          </p>
                        </div>
                      </div>
                      <span className="text-lg font-bold tabular-nums text-orange-600 dark:text-orange-400">
                        {smoothUploadProgress}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-orange-100 dark:bg-orange-900/40">
                      <ProgressFill
                        value={smoothUploadProgress}
                        className="h-full bg-linear-to-r from-orange-500 to-amber-400 transition-all duration-500"
                      />
                    </div>
                  </div>
                )}

                {/* ── STEP 1 · Drop zone ── */}
                <div className="rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="border-b border-gray-100 px-5 pt-5 pb-4 dark:border-zinc-800">
                    <SectionHeader step={1} label="Add Files" icon={<Upload size={14} />} />
                  </div>

                  <div className="p-4">
                    <div
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      onClick={() => !isSending && fileInputRef.current?.click()}
                      className={[
                        "relative overflow-hidden rounded-xl border-2 border-dashed transition-all duration-200",
                        isSending
                          ? "cursor-default border-gray-200 bg-gray-50/50 dark:border-zinc-700 dark:bg-zinc-800/30"
                          : isDragging
                            ? "scale-[1.005] cursor-copy border-orange-400 bg-orange-500/5 shadow-lg shadow-orange-500/10"
                            : "cursor-pointer border-gray-200 hover:border-orange-300 hover:bg-orange-50/40 dark:border-zinc-700 dark:hover:border-orange-600/50",
                      ].join(" ")}
                    >
                      <input ref={fileInputRef} type="file" multiple aria-label="Select files to upload"
                        className="hidden" onClick={(e) => e.stopPropagation()} onChange={onFileSelect} />
                      <input ref={folderRefCallback} type="file" aria-label="Select a folder to upload" multiple
                        className="hidden" onClick={(e) => e.stopPropagation()} onChange={onFolderSelect} />

                      {totalFileCount === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
                          <div className={[
                            "flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300",
                            isDragging ? "scale-110 bg-orange-500 text-white shadow-xl shadow-orange-500/30" : "bg-orange-50 text-orange-500 dark:bg-orange-500/10",
                          ].join(" ")}>
                            {isDragging ? <FolderOpen size={30} /> : <CloudUpload size={30} />}
                          </div>
                          <div>
                            <p className="text-base font-bold text-(--text)">
                              {isDragging ? "Drop files or folders here" : "Drag & drop files or folders"}
                            </p>
                            <p className="mt-1 text-sm text-(--text-muted)">
                              Any file type supported · Up to {formatBytes(UPLOAD_LIMITS.MAX_FILE_BYTES)} per file
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="secondary" size="sm" rounded="full" leftIcon={<Upload size={13} />}
                              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                              Browse Files
                            </Button>
                            <Button variant="ghost" size="sm" rounded="full" leftIcon={<Folder size={13} />}
                              onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}>
                              Browse Folder
                            </Button>
                            <Button variant="ghost" size="sm" rounded="full" leftIcon={<FolderOpen size={13} />}
                              onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}>
                              From Storage
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4">
                          {/* File list header */}
                          <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500/10 text-[11px] font-bold text-orange-600">
                                {totalFileCount}
                              </span>
                              <span className="text-sm font-semibold text-(--text)">
                                file{totalFileCount !== 1 ? "s" : ""}
                                {folderCount > 0 && <span className="ml-1 font-normal text-(--text-muted)">in {folderCount} folder{folderCount !== 1 ? "s" : ""}</span>}
                              </span>
                              <span className="text-xs text-(--text-muted)">· {formatBytes(totalSize)}</span>
                              {isSending && <span className="text-xs text-orange-500">· {uploadedCount} uploaded</span>}
                              {errorCount > 0 && <span className="text-xs text-red-500">· {errorCount} failed</span>}
                            </div>
                            {!isSending && (
                              <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto sm:justify-end">
                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-(--text-muted) transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800">
                                  <Plus size={12} /> Add Files
                                </button>
                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-(--text-muted) transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800">
                                  <Folder size={12} /> Folder
                                </button>
                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
                                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20">
                                  <FolderOpen size={12} /> From Storage
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="custom-scrollbar max-h-64 space-y-1 overflow-y-auto">

                            {/* Pre-loaded files from the Files page (already in storage) */}
                            {preloadedFiles.length > 0 && (
                              <div className="mb-1 overflow-hidden rounded-lg border border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/30 dark:bg-emerald-900/10">
                                <div className="flex items-center gap-2 border-b border-emerald-100 px-3 py-2 dark:border-emerald-900/20">
                                  <CheckCircle size={12} className="shrink-0 text-emerald-500" />
                                  <span className="flex-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                    {preloadedFiles.length} file{preloadedFiles.length !== 1 ? "s" : ""} from your storage
                                  </span>
                                  <span className="hidden text-[10px] text-emerald-600/70 sm:inline dark:text-emerald-500">
                                    already uploaded
                                  </span>
                                </div>
                                {preloadedFiles.map((f) => (
                                  <div key={f.id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                                    <CheckCircle size={11} className="shrink-0 text-emerald-400" />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-medium text-(--text)">{f.name}</p>
                                      <p className="truncate text-[10px] text-(--text-muted)">
                                        {f.relativePath?.includes("/")
                                          ? `${f.relativePath.split("/").slice(0, -1).join("/")} · ${formatBytes(f.size)}`
                                          : formatBytes(f.size)}
                                      </p>
                                    </div>
                                    {!isSending && (
                                      <button
                                        type="button"
                                        aria-label={`Remove ${f.name}`}
                                        onClick={(e) => { e.stopPropagation(); setPreloadedFiles((p) => p.filter((x) => x.id !== f.id)); }}
                                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                                      >
                                        <X size={11} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* ── Folders section ── */}
                            {Object.keys(folderGroups).length > 0 && (
                              <div className="mb-0.5 flex items-center gap-1.5 px-1 pt-1">
                                <Folder size={11} className="text-orange-400" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-(--text-muted)">
                                  Folders ({Object.keys(folderGroups).length})
                                </span>
                              </div>
                            )}

                            {/* Folder groups */}
                            {Object.keys(folderGroups).sort().map((folderName) => {
                              const groupFiles  = folderGroups[folderName];
                              const isExpanded  = !collapsedFolders.has(folderName);
                              const groupSize   = groupFiles.reduce((s, f) => s + f.file.size, 0);
                              const doneInGroup = groupFiles.filter((f) => f.status === "done").length;
                              const errInGroup  = groupFiles.filter((f) => f.status === "error").length;

                              return (
                                <div key={folderName} className="overflow-hidden rounded-lg border border-(--border)">
                                  <div className="flex w-full items-center bg-(--bg-2) transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/60">
                                    <button type="button"
                                      onClick={(e) => { e.stopPropagation(); toggleFolder(folderName); }}
                                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
                                      {isExpanded
                                        ? <ChevronDown  size={12} className="shrink-0 text-gray-400" />
                                        : <ChevronRight size={12} className="shrink-0 text-gray-400" />}
                                      {doneInGroup === groupFiles.length
                                        ? <CheckCircle size={12} className="shrink-0 text-emerald-500" />
                                        : errInGroup > 0
                                          ? <AlertCircle size={12} className="shrink-0 text-red-500" />
                                          : <Folder size={12} className="shrink-0 text-orange-400" />}
                                      <span className="flex-1 truncate text-xs font-semibold text-(--text)">{folderName}</span>
                                      <span className="hidden shrink-0 text-[10px] text-(--text-muted) sm:inline">
                                        {groupFiles.length} files · {formatBytes(groupSize)}
                                      </span>
                                    </button>
                                    {!isSending && (
                                      <button type="button" aria-label={`Remove ${folderName}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setFiles((p) => p.filter((f) => !f.relativePath?.startsWith(`${folderName}/`)));
                                        }}
                                        className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                                        <X size={11} />
                                      </button>
                                    )}
                                  </div>
                                  {isExpanded && (
                                    <div className="divide-y divide-(--border) border-t border-(--border)">
                                      {groupFiles.map((sf) => {
                                        const subPath = sf.relativePath?.split("/").slice(1, -1).join("/");
                                        return (
                                          <div key={sf.id} className={uploadFileRowClass(sf.status)}>
                                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${fileIconShellClass(sf.status)}`}>
                                              {fileIcon(sf.file)}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                              {subPath && <p className="truncate text-[10px] text-gray-400">{subPath}/</p>}
                                              <p className="truncate text-xs font-semibold text-(--text)">{sf.file.name}</p>
                                              {sf.status === "error" && sf.error
                                                ? <p className="truncate text-[10px] text-red-500">{sf.error}</p>
                                                : <p className="text-[10px] text-(--text-muted)">{formatBytes(sf.file.size)}</p>}
                                              {sf.status === "uploading" && (
                                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-orange-100 dark:bg-orange-950/60">
                                                  <ProgressFill value={sf.progress} className="h-full rounded-full bg-linear-to-r from-orange-500 to-amber-400 transition-all duration-500" />
                                                </div>
                                              )}
                                            </div>
                                            <UploadStatusPill status={sf.status} progress={sf.progress} />
                                            {sf.status === "idle" && !isSending && (
                                              <button type="button" aria-label={`Remove ${sf.file.name}`}
                                                onClick={(e) => { e.stopPropagation(); setFiles((p) => p.filter((f) => f.id !== sf.id)); }}
                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                                                <X size={11} />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* ── Files section ── */}
                            {rootFiles.length > 0 && (
                              <div className={`flex items-center gap-1.5 px-1 pt-1 ${Object.keys(folderGroups).length > 0 ? "mt-1.5 border-t border-gray-100 pt-2 dark:border-zinc-800" : ""}`}>
                                <File size={11} className="text-blue-400" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-(--text-muted)">
                                  Files ({rootFiles.length})
                                </span>
                              </div>
                            )}

                            {/* Root files */}
                            {rootFiles.map((sf) => (
                              <div key={sf.id} className={uploadFileRowClass(sf.status)}>
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${fileIconShellClass(sf.status)}`}>
                                  {fileIcon(sf.file)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold text-(--text)">{sf.file.name}</p>
                                  {sf.status === "error" && sf.error
                                    ? <p className="truncate text-[10px] text-red-500">{sf.error}</p>
                                    : <p className="text-[10px] text-(--text-muted)">{formatBytes(sf.file.size)}</p>}
                                  {sf.status === "uploading" && (
                                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-orange-100 dark:bg-orange-950/60">
                                      <ProgressFill value={sf.progress} className="h-full rounded-full bg-linear-to-r from-orange-500 to-amber-400 transition-all duration-500" />
                                    </div>
                                  )}
                                </div>
                                <UploadStatusPill status={sf.status} progress={sf.progress} />
                                {sf.status === "idle" && !isSending && (
                                  <button type="button" aria-label={`Remove ${sf.file.name}`}
                                    onClick={(e) => { e.stopPropagation(); setFiles((p) => p.filter((f) => f.id !== sf.id)); }}
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-zinc-600 dark:hover:bg-red-900/20">
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── STEP 2 · Send method ── */}
                <div className="rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="border-b border-gray-100 px-5 pt-5 pb-4 dark:border-zinc-800">
                    <SectionHeader step={2} label="Choose Delivery Method" icon={<Send size={14} />} />
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-3 gap-2">
                      {METHODS.map((m) => {
                        const active = method === m.key;
                        return (
                          <button type="button" key={m.key}
                            onClick={() => !isSending && setMethod(m.key)}
                            disabled={isSending}
                            title={m.description}
                            className={[
                              "flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-all duration-150",
                              isSending ? "cursor-not-allowed opacity-50" : "hover:scale-[1.03] active:scale-[0.98]",
                              active ? `${m.activeBg} scale-[1.01]` : m.passiveBg,
                            ].join(" ")}>
                            <span className="flex items-center justify-center">{m.icon(18)}</span>
                            <span className="text-center text-[10px] font-bold leading-tight tracking-wide">
                              {m.shortLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-zinc-800/60">
                      <div className={`flex h-5 w-5 items-center justify-center rounded-md bg-linear-to-br ${currentMethod.gradient} text-white`}>
                        {currentMethod.icon(10)}
                      </div>
                      <p className="text-xs text-(--text-muted)">{currentMethod.description}</p>
                    </div>
                  </div>
                </div>

                {/* ── STEP 3 · Delivery options ── */}
                <div className="rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="border-b border-gray-100 px-5 pt-5 pb-4 dark:border-zinc-800">
                    <SectionHeader step={3} label="Delivery Details" icon={<Info size={14} />} />
                  </div>
                  <div className="space-y-5 p-5">

                    {/* Title */}
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-(--text)">
                        Transfer Title <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={isSending}
                        placeholder="e.g. Project Assets, Vacation Photos…"
                        className={inputCls("orange")}
                      />
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-(--text-muted)">
                        <Info size={9} /> Shown on the download page — auto-filled from first file
                      </p>
                    </div>

                    {/* Email */}
                    {method === "email" && (
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold text-(--text)">
                            Recipients <span className="text-red-400">*</span>
                          </label>
                          <div
                            className="min-h-11.5 w-full cursor-text rounded-xl border border-gray-200 bg-white px-3 py-2 transition-all focus-within:border-blue-400 focus-within:ring-3 focus-within:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-800"
                            onClick={() => (document.getElementById("email-chip-input") as HTMLInputElement)?.focus()}>
                            <div className="flex flex-wrap gap-1.5">
                              {emails.map((e) => (
                                <span key={e}
                                  className="flex max-w-full min-w-0 items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                                  <span className="min-w-0 truncate">{e}</span>
                                  <button type="button" aria-label={`Remove ${e}`}
                                    onClick={() => setEmails((p) => p.filter((x) => x !== e))}
                                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40">
                                    <X size={10} />
                                  </button>
                                </span>
                              ))}
                              <input id="email-chip-input" type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                onKeyDown={onEmailKey} onBlur={addEmail}
                                disabled={isSending}
                                placeholder={emails.length === 0 ? "Add email addresses…" : "Add more…"}
                                className="min-w-35 flex-1 bg-transparent text-sm text-(--text) outline-none placeholder:text-gray-400"
                              />
                            </div>
                          </div>
                          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-(--text-muted)">
                            <Info size={9} /> Press Enter or comma to add each address
                          </p>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold text-(--text)">Subject</label>
                          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                            disabled={isSending} placeholder="Files from Jai Export Enterprises"
                            className={inputCls("blue")}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold text-(--text)">Message <span className="font-normal text-(--text-muted)">(optional)</span></label>
                          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                            disabled={isSending} placeholder="Add a personal message…" rows={3}
                            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-(--text) outline-none transition-all placeholder:text-gray-400 focus:border-blue-400 focus:ring-3 focus:ring-blue-500/10 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
                          />
                        </div>
                      </div>
                    )}

                    {(method === "link" || method === "qr") && (
                      <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-4 dark:bg-zinc-800/50">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-200/80 dark:bg-zinc-700">
                          <Info size={12} className="text-(--text-muted)" />
                        </div>
                        <p className="text-sm text-(--text-muted)">
                          {method === "link"
                            ? "A secure shareable link will be generated after upload. Copy and share it anywhere."
                            : "A scannable QR code will be generated after upload — perfect for in-person sharing."}
                        </p>
                      </div>
                    )}

                    {/* Expiry */}
                    <div className="border-t border-gray-100 pt-5 dark:border-zinc-800">
                      <label htmlFor="transfer-expiry" className="mb-2 block text-sm font-semibold text-(--text)">
                        Link Expiry Date &amp; Time
                      </label>
                      <div className="mb-3 grid grid-cols-3 gap-2">
                        {EXPIRY_PRESETS.map((preset) => (
                          <button
                            key={preset.value}
                            type="button"
                            disabled={isSending}
                            onClick={() => {
                              setExpiresAt(getPresetExpiryValue(preset.value));
                              setExpiryPreset(preset.value);
                            }}
                            className={[
                              "rounded-xl border py-2.5 text-sm font-semibold transition-all duration-150 disabled:opacity-50",
                              expiryPreset === preset.value
                                ? "border-orange-400 bg-orange-500 text-white shadow-sm shadow-orange-500/25"
                                : "border-gray-200 bg-gray-50 text-(--text-muted) hover:border-orange-300 hover:bg-orange-50/60 dark:border-zinc-700 dark:bg-zinc-800",
                            ].join(" ")}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <input
                        id="transfer-expiry"
                        type="datetime-local"
                        value={expiresAt}
                        min={toDateTimeLocalValue(new Date(Date.now() + 60_000))}
                        max={toDateTimeLocalValue(new Date(Date.now() + MAX_EXPIRY_DAYS * 86_400_000))}
                        disabled={isSending}
                        onChange={(event) => {
                          setExpiresAt(event.target.value);
                          setExpiryPreset(null);
                        }}
                        suppressHydrationWarning
                        aria-invalid={Boolean(expiryError)}
                        className={`${inputCls("orange")} ${expiryError ? "border-red-300 focus:border-red-400 focus:ring-red-500/10 dark:border-red-800" : ""}`}
                      />
                      <p className={`mt-2 text-xs ${expiryError ? "text-red-500" : "text-(--text-muted)"}`}>
                        {expiryError ?? "Choose the exact expiry in your local time, up to one year from now."}
                      </p>
                    </div>

                    {/* Password */}
                    <div className="border-t border-gray-100 pt-5 dark:border-zinc-800">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={[
                            "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                            passwordEnabled ? "bg-orange-500/10" : "bg-gray-100 dark:bg-zinc-800",
                          ].join(" ")}>
                            {passwordEnabled
                              ? <Lock size={15} className="text-orange-500" />
                              : <Unlock size={15} className="text-gray-400" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-(--text)">Password Protection</p>
                            <p className="text-xs text-(--text-muted)">Require a password to access</p>
                          </div>
                        </div>
                        <label className={[
                          "relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors duration-200",
                          passwordEnabled ? "bg-orange-500" : "bg-gray-200 dark:bg-zinc-600",
                          isSending ? "cursor-not-allowed opacity-50" : "",
                        ].join(" ")}>
                          <input type="checkbox" className="sr-only" checked={passwordEnabled} disabled={isSending}
                            aria-label="Password protect"
                            onChange={() => { setPasswordEnabled((p) => !p); if (passwordEnabled) setPassword(""); }} />
                          <span className={[
                            "absolute h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                            passwordEnabled ? "translate-x-4" : "translate-x-0.5",
                          ].join(" ")} />
                        </label>
                      </div>
                      {passwordEnabled && (
                        <div className="relative mt-3">
                          <input type={showPassword ? "text" : "password"}
                            value={password} onChange={(e) => setPassword(e.target.value)}
                            disabled={isSending} placeholder="Enter a secure password"
                            className={`${inputCls("orange")} pr-11`}
                          />
                          <button type="button" onClick={() => setShowPassword((p) => !p)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600">
                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>

              {/* ── Right column ── */}
              <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">

                {/* Transfer summary card */}
                <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="h-1 w-full bg-linear-to-r from-orange-500 via-amber-400 to-orange-400" />
                  <div className="p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10">
                        <Zap size={13} className="text-orange-500" />
                      </div>
                      <span className="text-sm font-bold text-(--text)">Transfer Summary</span>
                    </div>

                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/60 px-4 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-800/40">
                      <SummaryRow label="Files" value={
                        totalFileCount > 0
                          ? `${totalFileCount} file${totalFileCount !== 1 ? "s" : ""}${folderCount > 0 ? ` (${folderCount} folder${folderCount !== 1 ? "s" : ""})` : ""}`
                          : <span className="text-(--text-muted)">None selected</span>
                      } />
                      <SummaryRow label="Total size" value={formatBytes(totalSize)} />
                      <SummaryRow label="Storage" value={
                        <span className="flex items-center gap-1 text-sky-500">
                          <CloudUpload size={11} /> Cloudflare R2
                        </span>
                      } />
                      <SummaryRow label="Method" value={
                        <span className={`flex items-center gap-1 ${currentMethod.color}`}>
                          {currentMethod.icon(11)} {currentMethod.shortLabel}
                        </span>
                      } />
                      {method === "email" && (
                        <SummaryRow label="Recipients" value={
                          emails.length > 0
                            ? `${emails.length} email${emails.length !== 1 ? "s" : ""}`
                            : <span className="text-orange-500">None added</span>
                        } />
                      )}
                      <SummaryRow label="Expires" value={formatExpiry(expiresAt)} />
                      <SummaryRow label="Password" value={
                        passwordEnabled
                          ? <span className="flex items-center gap-1 text-orange-500"><Lock size={10} /> Protected</span>
                          : <span className="text-(--text-muted)">None</span>
                      } />
                    </div>

                    <div className="mt-4 space-y-2">
                      <Button fullWidth size="lg" rounded="xl"
                        disabled={!canSend() || isSending}
                        loading={isSending}
                        onClick={handleSend}
                        rightIcon={isSending ? undefined : <ArrowRight size={17} />}>
                        {sendPhase === "uploading"
                          ? `Uploading… ${smoothUploadProgress}%`
                          : sendPhase === "creating"
                            ? "Creating transfer…"
                            : `Send ${totalFileCount > 0 ? formatBytes(totalSize) : "Files"}`}
                      </Button>

                      {totalFileCount === 0 && (
                        <p className="text-center text-xs text-(--text-muted)">Add files above to get started</p>
                      )}

                      {totalFileCount > 0 && !canSend() && !isSending && (
                        <div className="flex items-start gap-2 rounded-xl border border-orange-100 bg-orange-50/80 p-3 dark:border-orange-900/20 dark:bg-orange-900/10">
                          <AlertCircle size={12} className="mt-0.5 shrink-0 text-orange-500" />
                          <p className="text-xs text-orange-600 dark:text-orange-400">
                            {method === "email" && emails.length === 0 ? "Add at least one email address"
                              : passwordEnabled && !password ? "Enter a password or disable protection"
                              : expiryError ?? "Fill in the required fields above"}
                          </p>
                        </div>
                      )}

                      {errorCount > 0 && !isSending && (
                        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50/80 p-3 dark:border-red-900/20 dark:bg-red-900/10">
                          <AlertCircle size={12} className="mt-0.5 shrink-0 text-red-500" />
                          <p className="text-xs text-red-600 dark:text-red-400">
                            {errorCount} file{errorCount > 1 ? "s" : ""} failed — remove and re-add to retry
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pro tips */}
                <div className="rounded-2xl border border-orange-100/80 bg-linear-to-b from-orange-50/60 to-amber-50/30 p-5 dark:border-orange-900/20 dark:from-orange-950/20 dark:to-zinc-900/0">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles size={13} className="text-orange-500" />
                    <span className="text-xs font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400">Tips</span>
                  </div>
                  <ul className="space-y-2.5">
                    {[
                      "Drag & drop entire folders — structure is preserved",
                      "Use Link or QR for anonymous recipients",
                      "Password-protect sensitive transfers",
                      "Set expiry to auto-delete after your timeframe",
                    ].map((tip, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
                          <Check size={9} className="text-orange-500" />
                        </div>
                        <span className="text-xs leading-relaxed text-orange-700 dark:text-orange-300/80">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════
              RECENT TRANSFERS
          ══════════════════════════════════════ */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-6 dark:border-zinc-800">
              <div>
                <h2 className="font-bold text-(--text)">Recent Transfers</h2>
                <p className="text-xs text-(--text-muted)">Your last 10 sent transfers</p>
              </div>
              <button type="button" onClick={loadRecent}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-(--text-muted) transition-colors hover:bg-gray-100 hover:text-(--text) dark:hover:bg-zinc-800">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {recentLoading ? (
              <div className="flex items-center justify-center py-20">
                <Spinner size={24} />
              </div>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 dark:bg-zinc-800">
                  <Send size={22} className="text-gray-300 dark:text-zinc-600" />
                </div>
                <div>
                  <p className="font-semibold text-(--text)">No transfers yet</p>
                  <p className="mt-0.5 text-sm text-(--text-muted)">Your sent file transfers will appear here</p>
                </div>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-100 sm:hidden dark:divide-zinc-800">
                  {recent.map((tx) => {
                    const mCfg = METHODS.find((m) => m.key === tx.method);
                    const fileCount = getTransferFileCount(tx);
                    const totalSize = getTransferTotalSize(tx);
                    return (
                      <article key={tx.id} className="min-w-0 space-y-3 p-4">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-(--text)">
                              {tx.title || `Transfer ${tx.id.slice(-6)}`}
                            </p>
                            <p className="mt-1 truncate text-xs text-(--text-muted)">
                              {tx.recipients?.join(", ") || "No direct recipient"}
                            </p>
                          </div>
                          <StatusBadge status={tx.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-(--text-muted)">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${mCfg?.passiveBg ?? "bg-gray-100 text-gray-500"}`}>
                            {mCfg?.icon(12)}
                            <span className="capitalize">{tx.method}</span>
                          </span>
                          <span>{fileCount} file{fileCount !== 1 ? "s" : ""} · {formatBytes(totalSize)}</span>
                          <span className="inline-flex items-center gap-1"><Download size={11} /> {tx.downloads ?? 0}</span>
                          <span>{formatRelative(tx.createdAt)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-175">
                  <thead className="border-b border-gray-100 bg-gray-50/80 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <tr>
                      {["Method", "File", "Recipients / Target", "Size", "Status", "Sent", "Downloads"].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-(--text-muted)">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
                    {recent.map((tx) => {
                      const mCfg = METHODS.find((m) => m.key === tx.method);
                      const fileCount = getTransferFileCount(tx);
                      const totalSize = getTransferTotalSize(tx);
                      return (
                        <tr key={tx.id} className="group transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                          <td className="px-5 py-3.5">
                            <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${mCfg?.passiveBg ?? "bg-gray-100 text-gray-500"}`}>
                              {mCfg?.icon(12)}
                              <span className="capitalize">{tx.method}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-semibold text-(--text)">
                              {tx.title || `Transfer ${tx.id.slice(-6)}`}
                            </p>
                            {tx.hasPassword && (
                              <span className="mt-0.5 flex items-center gap-1 text-[10px] text-orange-500">
                                <Lock size={9} /> Password protected
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-(--text-muted)">
                            {tx.recipients?.join(", ") || "—"}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-(--text-muted)">
                            {fileCount} file{fileCount !== 1 ? "s" : ""} · {formatBytes(totalSize)}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={tx.status} />
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-sm text-(--text-muted)">
                            {formatRelative(tx.createdAt)}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1 text-sm font-medium text-(--text-muted)">
                              <Download size={12} /> {tx.downloads ?? 0}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </div>

        </div>

        <StoragePickerModal
          open={showPicker}
          onClose={() => setShowPicker(false)}
          onConfirm={handlePickerConfirm}
          alreadySelectedIds={alreadySelectedIds}
        />
      </DashboardLayout>
    </AuthGuard>
  );
}
