"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type DragEvent,
  type ChangeEvent,
} from "react";

import Link from "next/link";
import { Modal } from "@/components/ui";
import {
  Upload, X, CheckCircle, AlertCircle, File,
  Folder, FolderOpen, CloudUpload, Plus,
  ChevronRight, ChevronDown, Loader2, Copy, Check,
  Link2,
} from "lucide-react";
import { uploadApi, transfersApi, foldersApi } from "@/lib/api";
import { UPLOAD_LIMITS } from "@/helper/data_helper";
import { formatBytes } from "@/lib/utils";
import { showToast } from "@/lib/toast";
import Button from "../ui/Button";

/* ──────────────────────────────────────────
   FileSystem API helpers — folder drag & drop
────────────────────────────────────────── */
async function readAllEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
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
    await Promise.all(
      entries.map((e) =>
        traverseEntry(
          e,
          basePath ? `${basePath}/${entry.name}` : entry.name,
          out,
        ),
      ),
    );
  }
}

/* ──────────────────────────────────────────
   Types
────────────────────────────────────────── */
type FileStatus   = "pending" | "uploading" | "done" | "error";
type FolderStatus = "pending" | "creating" | "done" | "error";

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

interface UploadFile {
  id: string;
  file: File;
  /** Full relative path including folder segments, e.g. "vacation/sub/img.jpg" */
  relativePath: string;
  /** Path of the immediate parent folder, e.g. "vacation/sub". Empty string = root. */
  folderPath: string;
  progress: number;
  status: FileStatus;
  error?: string;
  /** File ID returned by the backend after a successful upload */
  backendFileId?: string;
  /** UploadSession ID returned by the backend for upload lifecycle tracking */
  uploadSessionId?: string;
}

interface UploadFolder {
  /** Full path, e.g. "vacation/sub" */
  path: string;
  /** Just the last segment shown to the user */
  name: string;
  /** Parent folder path, or null for root-level folders */
  parentPath: string | null;
  /** ID returned by foldersApi.create() — set after creation */
  backendId?: string;
  status: FolderStatus;
  /** Whether this node is expanded in the tree */
  expanded: boolean;
}

interface TransferLink {
  url: string;
  shortCode: string;
  transferId: string;
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  folderId?: string;
  onUploadComplete?: () => void;
  /**
   * When true, after all files are uploaded the modal automatically calls
   * POST /transfers/send with the uploaded file IDs and shows the shareable link.
   */
  transferMode?: boolean;
}

/* ──────────────────────────────────────────
   Helpers
────────────────────────────────────────── */

function extractFolderPaths(relativePaths: string[]): string[] {
  const folderSet = new Set<string>();
  relativePaths.forEach((rp) => {
    const parts = rp.split("/");
    for (let i = 1; i < parts.length; i++) {
      folderSet.add(parts.slice(0, i).join("/"));
    }
  });
  return Array.from(folderSet).sort(); // lexicographic = parent before child
}

function parentPath(path: string): string | null {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? null : path.slice(0, idx);
}

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

function getDroppedEntries(items: DataTransferItemList): FileSystemEntry[] {
  return Array.from(items)
    .map((item) => (item as DataTransferItemWithEntry).webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => entry !== null && entry !== undefined);
}

function uploadFileIdentity(file: File, relativePath: string) {
  return [
    relativePath || file.webkitRelativePath || file.name,
    file.size,
    file.lastModified,
  ].join("::");
}

function extractUploadedFileId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const data = payload as {
    id?: unknown;
    _id?: unknown;
    fileId?: unknown;
    file?: { id?: unknown; _id?: unknown; fileId?: unknown };
  };
  const id = data.id ?? data._id ?? data.fileId ?? data.file?.id ?? data.file?._id ?? data.file?.fileId;
  return id === undefined || id === null ? undefined : String(id);
}

function extractUploadSessionId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const data = payload as {
    uploadSessionId?: unknown;
    sessionId?: unknown;
    file?: { uploadSessionId?: unknown; sessionId?: unknown };
  };
  const id = data.uploadSessionId ?? data.sessionId ?? data.file?.uploadSessionId ?? data.file?.sessionId;
  return id === undefined || id === null ? undefined : String(id);
}

function getUploadErrorMessage(error: unknown, fileName: string): string {
  const axiosError = error as {
    response?: { status?: number; data?: { message?: string; error?: string } };
    message?: string;
  };
  const status = axiosError.response?.status;
  const serverMessage = axiosError.response?.data?.message ?? axiosError.response?.data?.error;

  if (serverMessage) return serverMessage;
  if (status === 503) {
    return `Upload service unavailable while uploading "${fileName}". Check that the backend and storage service are running.`;
  }
  if (status === 413) return `"${fileName}" is too large for the upload service.`;
  if (status) return `Upload failed with HTTP ${status}`;

  return axiosError.message ?? "Upload failed";
}

/* Tailwind indent class lookup — each level adds 20 px. */
const ROW_PL  = ["pl-3", "pl-8", "pl-[52px]", "pl-[72px]"] as const;
const NODE_ML = ["ml-6", "ml-11", "ml-16",    "ml-[84px]"] as const;
const rowPl  = (i: number) => ROW_PL [Math.min(i, ROW_PL.length  - 1)];
const nodeMl = (i: number) => NODE_ML[Math.min(i, NODE_ML.length - 1)];
const SMOOTH_PROGRESS_INTERVAL_MS = 24;

function useSmoothProgress(target: number) {
  const normalizedTarget = Math.max(0, Math.min(100, Math.round(target)));
  const [displayValue, setDisplayValue] = useState(normalizedTarget);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDisplayValue((current) => {
        if (normalizedTarget === 0 || normalizedTarget < current) {
          window.clearInterval(id);
          return normalizedTarget;
        }
        if (current >= normalizedTarget) {
          window.clearInterval(id);
          return normalizedTarget;
        }
        return Math.min(normalizedTarget, current + 1);
      });
    }, SMOOTH_PROGRESS_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [normalizedTarget]);

  return displayValue;
}

function SmoothProgressText({ value, className }: { value: number; className?: string }) {
  const displayValue = useSmoothProgress(value);
  return <span className={className}>{displayValue}%</span>;
}

function SmoothProgressBar({ value }: { value: number }) {
  const displayValue = useSmoothProgress(value);

  return (
    <div
      className="bar-fill h-full rounded-full bg-orange-500 transition-all duration-500 ease-out"
      style={{ "--bar-w": `${displayValue}%` } as CSSProperties}
    />
  );
}

/* ──────────────────────────────────────────
   Sub-components — defined at module scope so React preserves their
   identity across re-renders (inner functions cause unmount/remount).
────────────────────────────────────────── */

function FolderNodeIcon({ folder, files }: { folder: UploadFolder; files: UploadFile[] }) {
  if (folder.status === "creating")
    return <Loader2 size={14} className="shrink-0 animate-spin text-orange-400" />;
  if (folder.status === "error")
    return <AlertCircle size={14} className="shrink-0 text-red-500" />;
  if (folder.status === "done" && files.filter((f) => f.folderPath === folder.path).every((f) => f.status === "done"))
    return <CheckCircle size={14} className="shrink-0 text-emerald-500" />;
  return folder.expanded
    ? <FolderOpen size={14} className="shrink-0 text-orange-400" />
    : <Folder     size={14} className="shrink-0 text-orange-400" />;
}

interface FileRowProps {
  f: UploadFile;
  indent: number;
  uploading: boolean;
  onRemove: (id: string) => void;
}

function FileRow({ f, indent, uploading, onRemove }: FileRowProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800/50 ${rowPl(indent)}`}
    >
      <File size={13} className="shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-800 dark:text-gray-200">{f.file.name}</p>
        {f.status === "error" && f.error
          ? <p className="truncate text-[10px] font-medium text-red-500">{f.error}</p>
          : <p className="text-[10px] text-gray-400">{formatBytes(f.file.size)}</p>
        }
      </div>
      {f.status === "done"      && <CheckCircle size={13} className="shrink-0 text-emerald-500" />}
      {f.status === "error"     && <AlertCircle size={13} className="shrink-0 text-red-500" />}
      {f.status === "uploading" && (
        <SmoothProgressText
          value={f.progress}
          className="shrink-0 text-[11px] font-bold tabular-nums text-orange-500"
        />
      )}
      {f.status === "pending" && !uploading && (
        <button
          type="button"
          aria-label={`Remove ${f.file.name}`}
          onClick={() => onRemove(f.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-red-500/10 hover:text-red-500"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

interface FolderNodeProps {
  folder: UploadFolder;
  indent: number;
  folders: UploadFolder[];
  files: UploadFile[];
  onToggle: (path: string) => void;
  uploading: boolean;
  onRemove: (id: string) => void;
}

function FolderNode({ folder, indent, folders, files, onToggle, uploading, onRemove }: FolderNodeProps) {
  const childFolders = folders.filter((f) => f.parentPath === folder.path);
  const childFiles   = files.filter((f) => f.folderPath === folder.path);
  const allChildDone = childFiles.length > 0 && childFiles.every((f) => f.status === "done");

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(folder.path)}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800 ${rowPl(indent)}`}
      >
        {folder.expanded
          ? <ChevronDown  size={13} className="shrink-0 text-gray-400" />
          : <ChevronRight size={13} className="shrink-0 text-gray-400" />}
        <FolderNodeIcon folder={folder} files={files} />
        <span className="flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-200">
          {folder.name}
        </span>
        <span className="shrink-0 text-[11px] text-gray-400">
          {childFiles.length} file{childFiles.length !== 1 ? "s" : ""}
          {childFolders.length > 0 && ` · ${childFolders.length} folder${childFolders.length !== 1 ? "s" : ""}`}
        </span>
        {allChildDone && <CheckCircle size={12} className="shrink-0 text-emerald-500" />}
      </button>

      {folder.expanded && (
        <div className={`border-l border-gray-100 dark:border-zinc-800 ${nodeMl(indent)}`}>
          {childFolders.map((sub) => (
            <FolderNode key={sub.path} folder={sub} indent={indent + 1} folders={folders} files={files} onToggle={onToggle} uploading={uploading} onRemove={onRemove} />
          ))}
          {childFiles.map((f) => (
            <FileRow key={f.id} f={f} indent={0} uploading={uploading} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════ */
export default function UploadModal({
  open,
  onClose,
  folderId,
  onUploadComplete,
  transferMode = false,
}: UploadModalProps) {
  const [files,   setFiles]   = useState<UploadFile[]>([]);
  const [folders, setFolders] = useState<UploadFolder[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  /* Transfer-mode state */
  const [transferLink,    setTransferLink]    = useState<TransferLink | null>(null);
  const [creatingTransfer, setCreatingTransfer] = useState(false);
  const [linkCopied,       setLinkCopied]       = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const folderRefCallback = useCallback((node: HTMLInputElement | null) => {
    folderInputRef.current = node;
    if (node) {
      node.setAttribute("webkitdirectory", "");
      node.setAttribute("mozdirectory", "");
    }
  }, []);

  const uploading = files.some((f) => f.status === "uploading") ||
                    folders.some((f) => f.status === "creating");

  const busy = uploading || creatingTransfer;

  /* ── Build / replace queue from raw file+path pairs ── */
  const buildQueue = useCallback((items: { file: File; relativePath: string }[]) => {
    const validSize = items.filter(({ file }) => file.size <= UPLOAD_LIMITS.MAX_FILE_BYTES);
    const rejected = items.length - validSize.length;

    if (rejected > 0) {
      showToast.error(`${rejected} file${rejected !== 1 ? "s" : ""} skipped. Max size is ${formatBytes(UPLOAD_LIMITS.MAX_FILE_BYTES)} per file.`);
    }

    if (validSize.length === 0) return;

    const existing = new Set(files.map((f) => uploadFileIdentity(f.file, f.relativePath)));
    const accepted: { file: File; relativePath: string }[] = [];
    let duplicateCount = 0;
    let skippedForBatchSize = 0;
    let runningSize = files.reduce((sum, queued) => sum + queued.file.size, 0);

    for (const item of validSize) {
      const identity = uploadFileIdentity(item.file, item.relativePath);
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
    if (accepted.length === 0) return;

    const uploadFiles: UploadFile[] = accepted.map(({ file, relativePath }) => {
      const parts = relativePath.split("/");
      const fp    = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      return {
        id: crypto.randomUUID(),
        file,
        relativePath,
        folderPath: fp,
        progress: 0,
        status: "pending" as const,
      };
    });

    const allRelPaths  = accepted.map((i) => i.relativePath);
    const folderPaths  = extractFolderPaths(allRelPaths);
    const uploadFolders: UploadFolder[] = folderPaths.map((path) => ({
      path,
      name:       path.split("/").pop()!,
      parentPath: parentPath(path),
      status:     "pending" as const,
      expanded:   true,
    }));

    setFiles((prev)   => [...prev,   ...uploadFiles]);
    setFolders((prev) => {
      const existing = new Set(prev.map((f) => f.path));
      return [...prev, ...uploadFolders.filter((f) => !existing.has(f.path))];
    });
  }, [files]);

  /* ── Input handlers ── */
  const onFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    buildQueue(Array.from(e.target.files).map((f) => ({ file: f, relativePath: f.name })));
    e.target.value = "";
  }, [buildQueue]);

  const onFolderSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    buildQueue(
      Array.from(e.target.files).map((f) => ({
        file: f,
        relativePath: f.webkitRelativePath || f.name,
      })),
    );
    e.target.value = "";
  }, [buildQueue]);

  /* ── Drag & drop ── */
  const onDragOver  = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);

  const onDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    try {
      const entries = getDroppedEntries(e.dataTransfer.items);

      if (entries.length > 0) {
        const collected: { file: File; relativePath: string }[] = [];
        await Promise.all(entries.map((en) => traverseEntry(en, "", collected)));
        buildQueue(collected);
        return;
      }

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        buildQueue(droppedFiles.map((f) => ({ file: f, relativePath: f.name })));
      }
    } catch (err) {
      showToast.error((err as Error)?.message || "Could not read dropped files");
    }
  }, [buildQueue]);

  /* ── State patchers ── */
  function patchFile(id: string, patch: Partial<UploadFile>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function patchFolder(path: string, patch: Partial<UploadFolder>) {
    setFolders((prev) => prev.map((f) => (f.path === path ? { ...f, ...patch } : f)));
  }

  const toggleFolder = useCallback((path: string) => {
    setFolders((prev) => prev.map((f) => f.path === path ? { ...f, expanded: !f.expanded } : f));
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((x) => x.id !== id));
  }, []);

  /* ──────────────────────────────────────────
     STEP 1 — Create folders in the backend
  ────────────────────────────────────────── */
  async function createBackendFolders(
    sortedFolders: UploadFolder[],
    pathToId: Map<string, string>,
  ): Promise<void> {
    for (const folder of sortedFolders) {
      const parentId = folder.parentPath
        ? pathToId.get(folder.parentPath)
        : folderId;
      try {
        patchFolder(folder.path, { status: "creating" });

        const res = await foldersApi.create(
          parentId
            ? { name: folder.name, parentId }
            : { name: folder.name },
        );
        const d   = res.data?.data ?? res.data;
        const id  = d?.folder?.id ?? d?.id ?? d?._id;
        pathToId.set(folder.path, id);
        patchFolder(folder.path, { status: "done", backendId: id });
      } catch (err: unknown) {
        const axiosErr = err as {
          response?: {
            status?: number;
            data?: {
              message?: string;
              id?: string;
              _id?: string;
              folder?: { id?: string; _id?: string };
            };
          };
        };
        const status = axiosErr?.response?.status;
        const msg =
          axiosErr?.response?.data?.message ??
          (err as Error)?.message ?? "Folder creation failed";

        if (status === 409 || msg?.toLowerCase().includes("already exist")) {
          const existingId =
            axiosErr?.response?.data?.id ??
            axiosErr?.response?.data?._id ??
            axiosErr?.response?.data?.folder?.id ??
            axiosErr?.response?.data?.folder?._id;
          if (existingId) {
            pathToId.set(folder.path, existingId);
            patchFolder(folder.path, { status: "done", backendId: existingId });
            continue;
          }

          try {
            const listRes = await foldersApi.list(parentId ? { parentId } : undefined);
            const raw =
              listRes.data?.data?.folders ??
              listRes.data?.folders ??
              listRes.data?.data ??
              (Array.isArray(listRes.data) ? listRes.data : []);
            const items = raw as Array<{ id?: string; _id?: string; name: string }>;
            const existing = items.find(
              (f) => f.name.toLowerCase() === folder.name.toLowerCase(),
            );
            const fallbackId = existing?.id ?? existing?._id;
            if (fallbackId) {
              pathToId.set(folder.path, fallbackId);
              patchFolder(folder.path, { status: "done", backendId: fallbackId });
              continue;
            }
          } catch {
            // list call failed — fall through to throw
          }
        }

        patchFolder(folder.path, { status: "error" });
        throw new Error(`Could not create folder "${folder.name}": ${msg}`);
      }
    }
  }

  /* ──────────────────────────────────────────
     STEP 2 — Upload file to R2 via server-side proxy
  ────────────────────────────────────────── */
  async function uploadFile(
    uf: UploadFile,
    resolvedFolderId?: string,
  ): Promise<{ success: boolean; backendFileId?: string }> {
    try {
      patchFile(uf.id, { status: "uploading", progress: 0 });

      const res = await uploadApi.uploadFile(
        uf.file,
        resolvedFolderId,
        (progress) => patchFile(uf.id, { progress }),
      );

      const fileDoc = res.data?.data ?? res.data;
      const backendFileId = extractUploadedFileId(fileDoc);
      const uploadSessionId = extractUploadSessionId(fileDoc);

      if (!backendFileId) {
        if (process.env.NODE_ENV === "development") {
          console.error("[UploadModal] uploadFile: unexpected response shape", res.data);
        }
        throw new Error("Upload succeeded but server returned no file ID");
      }

      patchFile(uf.id, { status: "done", progress: 100, backendFileId, uploadSessionId });
      return { success: true, backendFileId };
    } catch (err: unknown) {
      const msg = getUploadErrorMessage(err, uf.file.name);
      patchFile(uf.id, { status: "error", error: msg });
      return { success: false };
    }
  }

  /* ──────────────────────────────────────────
     START — Orchestrate folder creation → file upload → transfer creation
  ────────────────────────────────────────── */
  async function startUpload() {
    const pendingFiles   = files.filter((f) => f.status === "pending");
    const pendingFolders = folders.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    const pathToId = new Map<string, string>(
      folders
        .filter((f) => f.backendId)
        .map((f) => [f.path, f.backendId!]),
    );

    if (pendingFolders.length > 0) {
      try {
        await createBackendFolders(pendingFolders, pathToId);
      } catch (err) {
        showToast.error((err as Error).message);
        return;
      }
    }

    type UploadResult = { success: boolean; backendFileId?: string; localFile: UploadFile };

    const results = await pool<UploadResult>(
      pendingFiles.map((f) => {
        const resolvedFolderId = f.folderPath ? pathToId.get(f.folderPath) : folderId;
        return async () => {
          const r = await uploadFile(f, resolvedFolderId);
          return { ...r, localFile: f };
        };
      }),
      4,
    );

    const successResults = results.filter((r) => r.success && r.backendFileId);
    const successCount   = successResults.length;
    const failCount      = results.length - successCount;

    if (successCount > 0) {
      showToast.success(`${successCount} file${successCount !== 1 ? "s" : ""} uploaded`);
      onUploadComplete?.();
    }
    if (failCount > 0) {
      showToast.error(`${failCount} file${failCount !== 1 ? "s" : ""} failed`);
    }

    /* ── Create transfer + shareable link ── */
    if (transferMode && successCount > 0) {
      setCreatingTransfer(true);
      try {
        const fileIds = successResults.map((r) => r.backendFileId!);

        const relativePaths: Record<string, string> = {};
        successResults.forEach((r) => {
          if (r.localFile.relativePath.includes("/") && r.backendFileId) {
            relativePaths[r.backendFileId] = r.localFile.relativePath;
          }
        });

        const title =
          fileIds.length === 1
            ? successResults[0].localFile.file.name
            : `${fileIds.length} file${fileIds.length !== 1 ? "s" : ""}`;

        const res = await transfersApi.send({
          title,
          method: "link",
          fileIds,
          ...(Object.keys(relativePaths).length ? { relativePaths } : {}),
          privacy: "public",
          expiry: 7,
        });

        const d = res.data?.data ?? res.data;
        const linkData     = d?.link;
        const transferData = d?.transfer;

        if (linkData?.url) {
          setTransferLink({
            url:        linkData.url,
            shortCode:  linkData.shortCode ?? "",
            transferId: transferData?.id ?? "",
          });
        } else {
          showToast.error("Transfer created but link URL missing");
        }
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (err as Error)?.message ?? "Could not create transfer link";
        showToast.error(msg);
      } finally {
        setCreatingTransfer(false);
      }
    }
  }

  const handleClose = useCallback(() => {
    if (busy) return;
    setFiles([]);
    setFolders([]);
    setTransferLink(null);
    setLinkCopied(false);
    onClose();
  }, [busy, onClose]);

  const copyLink = useCallback(() => {
    if (!transferLink) return;
    navigator.clipboard.writeText(transferLink.url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [transferLink]);

  /* ── Derived counts ── */
  const pendingFiles = files.filter((f) => f.status === "pending");
  const doneCount    = files.filter((f) => f.status === "done").length;
  const errorCount   = files.filter((f) => f.status === "error").length;

  const rootFiles   = files.filter((f) => f.folderPath === "");
  const rootFolders = folders.filter((f) => f.parentPath === null);

  /* ════════════════════════════════════
     RENDER
  ════════════════════════════════════ */
  return (
    <Modal open={open} onClose={handleClose} title="Upload Files & Folders" width={580}>

      {/* ── Drop zone (hidden while files are queued) ── */}
      {files.length === 0 && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 ${
            isDragging
              ? "scale-[1.01] cursor-copy border-orange-500 bg-orange-500/5"
              : "cursor-default border-gray-200 bg-gray-50/60 hover:border-orange-300 hover:bg-orange-50/30 dark:border-zinc-700 dark:bg-zinc-800/30 dark:hover:border-orange-600"
          }`}
        >
          <input ref={fileInputRef} type="file" multiple hidden aria-label="Select files" onChange={onFileSelect} />
          <input
            ref={folderRefCallback}
            type="file"
            multiple
            hidden
            aria-label="Select folder"
            onChange={onFolderSelect}
          />

          <div className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors duration-200 ${
              isDragging ? "bg-orange-500 text-white" : "bg-orange-500/10 text-orange-500"
            }`}>
              {isDragging ? <FolderOpen size={32} /> : <Upload size={32} />}
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-white">
                {isDragging ? "Drop files or folders here" : "Upload files or folders"}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Drag &amp; drop, or browse · Any type · Up to {formatBytes(UPLOAD_LIMITS.MAX_FILE_BYTES)} per file
              </p>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                {transferMode
                  ? "Files will be uploaded and a shareable link will be generated"
                  : "Folder structure is preserved in your storage"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" leftIcon={<Upload size={14} />}
                onClick={() => fileInputRef.current?.click()}>
                Browse Files
              </Button>
              <Button type="button" variant="ghost" size="sm" leftIcon={<Folder size={14} />}
                onClick={() => folderInputRef.current?.click()}>
                Browse Folder
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tree view ── */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {files.length} file{files.length !== 1 ? "s" : ""}
              {rootFolders.length > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                  <Folder size={11} />
                  {rootFolders.length} folder{rootFolders.length !== 1 ? "s" : ""}
                </span>
              )}
            </p>
            {!uploading && !transferLink && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:underline dark:text-orange-400">
                  <Plus size={12} /> Add files
                </button>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <button type="button" onClick={() => folderInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:underline dark:text-orange-400">
                  <Plus size={12} /> Add folder
                </button>
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" multiple hidden aria-label="Select files" onChange={onFileSelect} />
          <input
            ref={folderRefCallback}
            type="file"
            multiple
            hidden
            aria-label="Select folder"
            onChange={onFolderSelect}
          />

          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`custom-scrollbar max-h-72 overflow-y-auto rounded-2xl border transition-colors ${
              isDragging
                ? "border-orange-400 bg-orange-50/40 dark:bg-orange-900/10"
                : "border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            }`}
          >
            {rootFolders.map((folder) => (
              <FolderNode
                key={folder.path}
                folder={folder}
                indent={0}
                folders={folders}
                files={files}
                onToggle={toggleFolder}
                uploading={uploading}
                onRemove={removeFile}
              />
            ))}
            {rootFiles.map((f) => (
              <FileRow key={f.id} f={f} indent={0} uploading={uploading} onRemove={removeFile} />
            ))}

            {files.filter((f) => f.status === "uploading").map((f) => (
              <div key={`prog-${f.id}`} className="px-3 pb-1">
                <div className="h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                  <SmoothProgressBar value={f.progress} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Status summary (non-transfer mode) ── */}
      {!transferMode && (doneCount > 0 || errorCount > 0) && !uploading && (
        <div className="mt-3 flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800">
          {doneCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={13} /> {doneCount} uploaded
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-500">
              <AlertCircle size={13} /> {errorCount} failed
            </span>
          )}
        </div>
      )}

      {/* ── Uploading banner ── */}
      {uploading && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-orange-200/60 bg-orange-50/60 px-4 py-3 dark:border-orange-900/30 dark:bg-orange-900/10">
          <CloudUpload size={14} className="shrink-0 animate-pulse text-orange-500" />
          <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
            {folders.some((f) => f.status === "creating")
              ? "Creating folder structure…"
              : `Uploading to R2… ${doneCount} / ${files.length} done`}
          </span>
        </div>
      )}

      {/* ── Creating transfer banner ── */}
      {creatingTransfer && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-orange-200/60 bg-orange-50/60 px-4 py-3 dark:border-orange-900/30 dark:bg-orange-900/10">
          <Loader2 size={14} className="shrink-0 animate-spin text-orange-500" />
          <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
            Creating transfer link…
          </span>
        </div>
      )}

      {/* ── Transfer link ready ── */}
      {transferLink && !creatingTransfer && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 dark:border-emerald-900/30 dark:bg-emerald-900/10">
          <div className="mb-2.5 flex items-center gap-2">
            <Link2 size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Transfer link ready — share this with anyone
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200/80 bg-white px-3 py-2 dark:border-emerald-800/30 dark:bg-zinc-900">
            <span className="flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
              {transferLink.url}
            </span>
            <button
              type="button"
              onClick={copyLink}
              title="Copy link"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-emerald-100 hover:text-emerald-600 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400"
            >
              {linkCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            </button>
          </div>
          {transferLink.transferId && (
            <div className="mt-2 flex items-center justify-end">
              <Link
                href={`/transfers/${transferLink.transferId}`}
                onClick={handleClose}
                className="text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                View transfer details →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="mt-5 flex items-center justify-between gap-2.5">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {files.length > 0
            ? `${formatBytes(files.reduce((s, f) => s + f.file.size, 0))} total`
            : "No files selected"}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
            {(doneCount > 0 && errorCount === 0 && !busy) || transferLink
              ? "Done"
              : "Cancel"}
          </Button>

          {!transferLink && (
            <Button
              type="button"
              onClick={startUpload}
              loading={busy}
              disabled={pendingFiles.length === 0 || busy}
              leftIcon={!busy ? <Upload size={15} /> : undefined}
            >
              {creatingTransfer
                ? "Creating link…"
                : uploading
                ? "Uploading…"
                : pendingFiles.length > 0
                ? `Upload ${pendingFiles.length} file${pendingFiles.length !== 1 ? "s" : ""}`
                : "Upload"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
