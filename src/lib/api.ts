import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosProgressEvent,
  InternalAxiosRequestConfig,
} from "axios";
import { UPLOAD_LIMITS } from "@/helper/data_helper";
import { notifyAppDataChanged } from "@/lib/app-events";
import { resolveUploadContentType } from "@/lib/file-types";
import { runUploadTasks, waitForUploadRetry } from "@/lib/upload-tasks";
import { getErrorMessage } from "@/lib/error-handler";

/* =========================
   CONFIG
========================= */

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const MAX_429_RETRIES = 3;
const DEFAULT_429_WAIT_MS = 5000;
const MAX_429_WAIT_MS = 30000;
const MAX_PART_UPLOAD_RETRIES = 3;
const PART_UPLOAD_RETRY_BASE_MS = 1000;
const SIMPLE_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const PART_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const FINALIZE_TIMEOUT_MS = 2 * 60 * 1000;
/** Pre-sign all part URLs at initiate time up to this many parts (keeps the response small). */
const MAX_UPFRONT_PART_URLS = 200;
const MIN_PART_BYTES = 5 * 1024 * 1024;
const MAX_PART_BYTES = 128 * 1024 * 1024;
const MAX_PARTS = 10000;

/**
 * Set once a browser → storage PUT is rejected before any byte is sent
 * (typically the R2 bucket CORS policy not allowing this site's origin).
 * Later uploads then skip the doomed direct attempt and use the API instead.
 */
let directStorageBlocked = false;

/* =========================
   TYPES
========================= */

type RetryableRequest = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _retryCount?: number;
};

type QueueItem = {
  resolve: () => void;
  reject: (error: unknown) => void;
};

type UploadApiResponse = AxiosResponse<Record<string, unknown>>;

type MultipartInitiateData = {
  uploadId?: string;
  key?: string;
  partSize?: number;
  uploadSessionId?: string;
  sessionId?: string;
  file?: { uploadSessionId?: string };
};

type MultipartPartUrlData = {
  url?: string;
  uploadUrl?: string;
  presignedUrl?: string;
};

type MultipartServerPartData = {
  etag?: string;
  eTag?: string;
  ETag?: string;
  partNumber?: number;
};

type UploadProgressCallback = (
  progress: number,
  loadedBytes: number,
  totalBytes: number,
) => void;

function unwrapData<T = Record<string, unknown>>(payload: unknown): T {
  let current = payload;

  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== "object" || !("data" in current)) break;
    const next = (current as { data?: unknown }).data;
    if (next === undefined || next === null) break;
    current = next;
  }

  return ((current ?? {}) as T);
}

function assertUsableUploadUrl(rawUrl: string, partNumber: number): string {
  try {
    const parsed = new URL(rawUrl);
    const signedPartNumber = parsed.searchParams.get("partNumber");

    if (signedPartNumber && Number(signedPartNumber) !== partNumber) {
      throw new Error(
        `Upload URL for part ${partNumber} was signed for part ${signedPartNumber}`,
      );
    }

    return parsed.toString();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Upload URL for part ${partNumber} is not a valid URL`);
    }
    throw error;
  }
}

class StorageUploadError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly bytesSent: number,
  ) {
    super(message);
    this.name = "StorageUploadError";
  }
}

/** PUT bytes straight to a presigned storage URL (R2), bypassing the API servers. */
function putToStorage(
  url: string,
  body: Blob,
  options: {
    contentType?: string;
    requireEtag?: boolean;
    label: string;
    signal?: AbortSignal;
    onProgress?: (loaded: number) => void;
  },
): Promise<string> {
  const { contentType, requireEtag, label, signal, onProgress } = options;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let bytesSent = 0;

    const cleanup = () => {
      settled = true;
      signal?.removeEventListener("abort", abort);
    };

    const fail = (error: Error) => {
      if (settled) return;
      cleanup();
      reject(error);
    };

    const abort = () => {
      xhr.abort();
      fail(new DOMException("Upload aborted", "AbortError"));
    };

    if (signal?.aborted) {
      abort();
      return;
    }

    xhr.open("PUT", url, true);
    xhr.responseType = "text";
    xhr.timeout = PART_UPLOAD_TIMEOUT_MS;
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);

    signal?.addEventListener("abort", abort, { once: true });

    xhr.upload.onprogress = (event) => {
      bytesSent = event.loaded;
      onProgress?.(event.loaded);
    };

    xhr.onerror = () => {
      fail(new StorageUploadError("ERR_NETWORK", null, bytesSent));
    };

    xhr.ontimeout = () => {
      fail(new StorageUploadError(`${label} timed out`, null, bytesSent));
    };

    xhr.onabort = () => {
      fail(new DOMException("Upload aborted", "AbortError"));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        fail(new StorageUploadError(`HTTP ${xhr.status}`, xhr.status, bytesSent));
        return;
      }

      const etag = xhr.getResponseHeader("ETag")?.replace(/^"|"$/g, "") ?? "";
      if (requireEtag && !etag) {
        // The PUT succeeded but the bucket CORS policy hides the ETag header.
        fail(new StorageUploadError("ERR_ETAG_HIDDEN", xhr.status, bytesSent));
        return;
      }

      cleanup();
      resolve(etag);
    };

    xhr.send(body);
  });
}

/**
 * True when storage refused the request before any bytes were sent — the
 * signature of a CORS block (or a hidden ETag), not a flaky connection.
 */
function isStorageBlockedError(error: unknown): boolean {
  if (!(error instanceof StorageUploadError)) return false;
  if (error.message === "ERR_ETAG_HIDDEN") return true;
  if (error.message !== "ERR_NETWORK" || error.bytesSent > 0) return false;
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function isRetryableUploadError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof StorageUploadError) {
    if (error.status === null) return true; // network drop / timeout
    // 403 usually means the presigned URL expired; a fresh URL is fetched on retry.
    return [403, 408, 429].includes(error.status) || error.status >= 500;
  }
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  const status = error.response.status;
  return status === 408 || status === 429 || status >= 500;
}

function storageCorsHelp(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "this site";
  return `The storage bucket is blocking uploads from ${origin}. Add ${origin} to the R2 bucket CORS policy (methods GET, HEAD, PUT; headers *; expose ETag).`;
}

function getPartUploadErrorMessage(error: unknown, label: string): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Upload canceled";
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Check your connection and retry.";
  }

  if (error instanceof StorageUploadError) {
    if (isStorageBlockedError(error)) return `${label}: ${storageCorsHelp()}`;
    if (error.message === "ERR_NETWORK") return `${label}: the connection dropped. Please retry.`;
    if (error.status === 403) return `${label}: the upload link expired. Please retry.`;
    if (error.status) return `${label} failed (storage returned HTTP ${error.status})`;
    return `${label}: ${error.message}`;
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (!error.response) return `${label}: network error. Please retry.`;
    if (status === 401) return "Your session has expired. Please sign in again and retry.";
    if (status === 413) {
      return `${label}: the server rejected the chunk as too large. ${storageCorsHelp()}`;
    }
    return `${label}: ${getErrorMessage(error)}`;
  }

  return (error as Error)?.message || `${label} failed`;
}

/** Pick a part size that keeps the part count within storage limits. */
function choosePartSize(fileSize: number): number {
  let partSize = Math.max(UPLOAD_LIMITS.PART_SIZE, MIN_PART_BYTES);
  while (Math.ceil(fileSize / partSize) > MAX_PARTS && partSize < MAX_PART_BYTES) {
    partSize *= 2;
  }
  return Math.min(partSize, MAX_PART_BYTES);
}

function contentTypedBody(file: File, contentType: string): Blob {
  return file.type === contentType ? file : file.slice(0, file.size, contentType);
}

/* =========================
   SINGLETON STATE
========================= */

let api: AxiosInstance | undefined;
let isRefreshing = false;
let failedQueue: QueueItem[] = [];

/* =========================
   QUEUE HANDLER
========================= */

function processQueue(error?: unknown) {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error);
    } else {
      p.resolve();
    }
  });
  failedQueue = [];
}

/* =========================
   HELPERS
========================= */

function parseRetryAfter(headerValue: string | undefined): number {
  if (!headerValue) return DEFAULT_429_WAIT_MS;

  // Numeric seconds form
  const asNum = Number(headerValue);
  if (Number.isFinite(asNum) && asNum >= 0) {
    return Math.min(asNum * 1000, MAX_429_WAIT_MS);
  }

  // HTTP-date form
  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) {
    const diff = asDate - Date.now();
    return Math.min(Math.max(diff, 0), MAX_429_WAIT_MS);
  }

  return DEFAULT_429_WAIT_MS;
}

function isExcludedAuthRoute(url?: string): boolean {
  if (!url) return false;
  const excluded = [
    "/auth/login",
    "/auth/logout",
    "/auth/refresh",
    "/auth/forgot-password",
    "/auth/reset-password",
  ];
  // Match by path segment to avoid false positives like `/auth/login-foo`
  return excluded.some(
    (route) => url.endsWith(route) || url.includes(`${route}?`),
  );
}

/* =========================
   AXIOS INSTANCE
========================= */

export function getApi(): AxiosInstance {
  if (api) return api;

  api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    timeout: 10000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  /* =========================
     RESPONSE INTERCEPTOR
  ========================= */

  api.interceptors.response.use(
    (response) => response,

    async (error: AxiosError) => {
      // Canceled requests have no response, but are not network failures.
      if (axios.isCancel(error)) {
        return Promise.reject(error);
      }

      const originalRequest = error.config as RetryableRequest | undefined;

      // Network / CORS / timeout (no response at all)
      if (!error.response) {
        if (process.env.NODE_ENV === "development") {
          console.error("Network/CORS error:", error.message);
        }
        return Promise.reject(error);
      }

      if (!originalRequest) {
        return Promise.reject(error);
      }

      const status = error.response.status;

      if (process.env.NODE_ENV === "development") {
        console.log("API ERROR:", status, originalRequest.url);
      }

      const isExcluded = isExcludedAuthRoute(originalRequest.url);

      /* =========================
         RATE LIMIT (429) — bounded retry
      ========================= */
      if (status === 429) {
        originalRequest._retryCount = (originalRequest._retryCount ?? 0) + 1;
        if (originalRequest._retryCount > MAX_429_RETRIES) {
          return Promise.reject(error);
        }

        const retryAfter = (
          error.response.headers as Record<string, string> | undefined
        )?.["retry-after"];
        const waitTime = parseRetryAfter(retryAfter);

        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return api!(originalRequest);
      }

      /* =========================
         REFRESH TOKEN FLOW (401)
      ========================= */
      if (status === 401 && !originalRequest._retry && !isExcluded) {
        originalRequest._retry = true;

        // Another request is already refreshing — wait for it
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({
              resolve: () => api!(originalRequest).then(resolve).catch(reject),
              reject,
            });
          });
        }

        isRefreshing = true;

        try {
          await api!.post("/auth/refresh");
          processQueue();
          return api!(originalRequest);
        } catch (err) {
          processQueue(err);
          // redirectToLogin();
          return Promise.reject(err);
        } finally {
          isRefreshing = false;
        }
      }

      // Refresh endpoint itself returned 401 — session is gone
      // if (status === 401 && originalRequest.url?.endsWith("/auth/refresh")) {
      //   redirectToLogin();
      // }

      return Promise.reject(error);
    },
  );

  return api;
}

async function postUploadForm(
  path: string,
  formData: FormData,
  config: AxiosRequestConfig<FormData>,
): Promise<UploadApiResponse> {
  // Keep regular uploads on the same origin as the application. In production,
  // authentication cookies belong to the frontend domain and are not reliably
  // available to a direct request to a separately hosted backend domain.
  // Files at or above MULTIPART_THRESHOLD do not use this function; their bytes
  // are sent directly to R2 with presigned multipart URLs.
  return getApi().post(path, formData, config);
}

/* =========================
   AUTH API
   ✅ No token storage needed — cookies handled by browser
========================= */

export const authApi = {
  login: (email: string, password: string) =>
    getApi().post("/auth/login", { email, password }),

  verifyTwoFactorLogin: (email: string, otp: string) =>
    getApi().post("/auth/verify-two-factor", { email, otp }),

  logout: () => getApi().post("/auth/logout"),

  /** Revoke all sessions across all devices for the current user. */
  logoutAll: () => getApi().post("/auth/logout-all"),

  enableTwoFactor: (otp: string) =>
    getApi().patch("/auth/two-factor/enable", { otp }),

  disableTwoFactor: (otp: string) =>
    getApi().patch("/auth/two-factor/disable", { otp }),

  deleteAccount: (otp: string) =>
    getApi().delete("/auth/account", { data: { otp } }),

  me: () => getApi().get("/auth/me"),

  refresh: () => getApi().post("/auth/refresh"),

  forgotPassword: (email: string) =>
    getApi().post("/auth/forgot-password", { email }),

  resetPassword: (data: { email: string; otp: string; newPassword: string }) =>
    getApi().post("/auth/reset-password", data),

  /** Verify an OTP for any purpose (email verify, password reset, etc.) */
  verifyOtp: (data: { email: string; otp: string; purpose: string }) =>
    getApi().post("/auth/verify-otp", data),

  /** Request a new OTP for a sensitive action (must be authenticated). */
  requestOtp: (data: { purpose: string; fileId?: string }) =>
    getApi().post("/auth/request-otp", data),

  /** Resend an OTP — public endpoint, no auth required. */
  resendOtp: (data: { email: string; purpose?: string }) =>
    getApi().post("/auth/resend-otp", data),
};

/* =========================
   USERS API
========================= */

export const usersApi = {
  /** Admin: create a new user */
  create: (data: Record<string, unknown>) => getApi().post("/users", data),

  /** Admin: list users — supports page, limit, search, role, isActive */
  list: (params?: Record<string, unknown>) =>
    getApi().get("/users", { params }),

  /** Admin: persist drag-and-drop user ordering. */
  reorder: (userIds: string[]) => getApi().patch("/users/order", { userIds }),

  /** Own profile */
  me: () => getApi().get("/users/me"),

  /** Update own profile (name/department/phone/avatar only) */
  updateMe: (data: Record<string, unknown>) => getApi().patch("/users/me", data),

  /** Upload the current user's profile photo or banner image. */
  uploadProfileMedia: (kind: "avatar" | "banner", file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    // Remove the shared JSON content type so the browser adds the required
    // multipart boundary and Nest's FileInterceptor can read the file field.
    return getApi().patch(`/users/me/profile-media/${kind}`, formData, {
      headers: { "Content-Type": undefined },
    });
  },

  /** Own in-app notification preferences */
  getNotificationPreferences: () =>
    getApi().get("/users/me/notification-preferences"),

  /** Update one or more in-app notification preferences */
  updateNotificationPreferences: (data: {
    fileShared?: boolean;
    uploadComplete?: boolean;
    downloadActivity?: boolean;
    systemUpdates?: boolean;
  }) => getApi().patch("/users/me/notification-preferences", data),

  getWorkspacePreferences: () =>
    getApi().get("/users/me/workspace-preferences"),

  updateWorkspacePreferences: (data: {
    language?: "en" | "hi" | "ta";
    timeFormat?: "12" | "24";
  }) => getApi().patch("/users/me/workspace-preferences", data),

  /** Own storage usage */
  myStorage: (signal?: AbortSignal) => getApi().get("/users/me/storage", { signal }),

  /** Change own password */
  updatePassword: (data: { currentPassword: string; newPassword: string }) =>
    getApi().put("/users/me/password", data),

  /** Admin: get any user by id */
  getById: (id: string) => getApi().get(`/users/${id}`),

  /** Admin: update any user field */
  updateById: (id: string, data: Record<string, unknown>) =>
    getApi().patch(`/users/${id}`, data),

  /** Admin: activate user */
  activate: (id: string) => getApi().patch(`/users/${id}/activate`),

  /** Admin: deactivate user */
  deactivate: (id: string) => getApi().patch(`/users/${id}/deactivate`),

  /** Superadmin: hard-delete user */
  delete: (id: string) => getApi().delete(`/users/${id}`),

  /** Admin: get user storage usage */
  getStorage: (id: string) => getApi().get(`/users/${id}/storage`),

  /** Admin: storage usage for all visible users */
  storageUsage: (params?: Record<string, unknown>) =>
    getApi().get("/users/storage/usage", { params }),

  /** Admin: update storage quota */
  updateQuota: (id: string, quotaBytes: number) =>
    getApi().patch(`/users/${id}/quota`, { quotaBytes }),

  /** Admin: force-recalculate storage from file records */
  syncStorage: (id: string) => getApi().post(`/users/${id}/sync-storage`),

  /** Admin: aggregate stats (total, active, by role, storage totals) */
  adminStats: () => getApi().get("/users/admin/stats"),
};

/* =========================
   FILES API
========================= */

export const filesApi = {
  list: (params?: Record<string, unknown>, signal?: AbortSignal) => {
    // Backend expects `search` and `category` query names.
    if (params) {
      const mapped: Record<string, unknown> = { ...params };
      if (mapped.q !== undefined) {
        mapped.search = mapped.q;
        delete mapped.q;
      }
      if (mapped.type !== undefined) {
        mapped.category = mapped.type;
        delete mapped.type;
      }
      params = mapped;
    }
    return getApi().get("/files", { params, signal });
  },

  getById: (id: string) => getApi().get(`/files/${id}`),

  getTrash: () => getApi().get("/files/trash"),

  sharedWithMe: (params?: Record<string, unknown>) =>
    getApi().get("/files/shared-with-me", { params }),

  create: async (data: {
    key: string;
    originalName: string;
    size: number;
    mimeType: string;
    folderId?: string;
    fileId?: string;
    uploadSessionId?: string;
    tags?: string[];
  }) => {
    const res = await getApi().post("/files", data, { timeout: FINALIZE_TIMEOUT_MS });
    notifyAppDataChanged({
      source: "upload",
      files: true,
      folders: Boolean(data.folderId),
      storage: true,
    });
    return res;
  },

  // Returns { success, data: { downloadUrl, file, expiresIn } } — use downloadUrl to fetch.
  download: (id: string, signal?: AbortSignal) =>
    getApi().get(`/files/${id}/download`, { signal }),

  /** Update file description and/or tags. */
  update: (id: string, data: { description?: string; tags?: string[] }) =>
    getApi().patch(`/files/${id}`, data),

  delete: (id: string) => getApi().delete(`/files/${id}`),

  restore: (id: string) => getApi().patch(`/files/${id}/restore`),

  permanentDelete: (id: string) => getApi().delete(`/files/${id}/permanent`),

  rename: (id: string, name: string) =>
    getApi().patch(`/files/${id}/rename`, { fileName: name }),

  bulkDelete: (ids: string[]) =>
    getApi().post("/files/bulk-delete", { fileIds: ids }),

  bulkRestore: (ids: string[]) => getApi().post("/files/bulk-restore", { fileIds: ids }),

  bulkMove: (ids: string[], folderId: string | null) =>
    getApi().post("/files/bulk-move", { fileIds: ids, folderId }),

  /** Save multiple file metadata records in one request (after folder upload). */
  batchCreate: async (files: {
    fileId?: string;
    key: string;
    originalName: string;
    size: number;
    mimeType: string;
    folderId?: string;
    uploadSessionId?: string;
    relativePath?: string;
    tags?: string[];
  }[]) => {
    const res = await getApi().post("/files/batch", { files }, { timeout: FINALIZE_TIMEOUT_MS });
    notifyAppDataChanged({
      source: "upload",
      files: true,
      folders: files.some((file) => Boolean(file.folderId || file.relativePath?.includes("/"))),
      storage: true,
    });
    return res;
  },

  /** Get a short-lived inline view URL for browser preview. */
  getViewUrl: (id: string) => getApi().get(`/files/${id}/view`),

  adminStats: () => getApi().get("/files/admin/stats"),
};

/* =========================
   UPLOAD API
========================= */

export const uploadApi = {
  uploadFile: (
    file: File,
    folderId?: string,
    onProgress?: UploadProgressCallback,
    signal?: AbortSignal,
  ): Promise<UploadApiResponse> => {
    signal?.throwIfAborted();
    if (file.size > UPLOAD_LIMITS.MAX_FILE_BYTES) {
      throw new Error(`File is larger than ${Math.round(UPLOAD_LIMITS.MAX_FILE_BYTES / 1024 ** 3)} GB`);
    }

    if (file.size >= UPLOAD_LIMITS.MULTIPART_THRESHOLD) {
      return uploadApi.uploadMultipartFile(file, folderId, onProgress, signal);
    }

    return uploadApi.uploadSingleFile(file, folderId, onProgress, signal);
  },

  /**
   * Upload a file below the multipart threshold. Bytes go straight from the
   * browser to storage with a presigned URL (fast, no API body limits). If the
   * bucket blocks this origin, small files fall back to the API proxy.
   */
  uploadSingleFile: async (
    file: File,
    folderId?: string,
    onProgress?: UploadProgressCallback,
    signal?: AbortSignal,
  ): Promise<UploadApiResponse> => {
    const contentType = resolveUploadContentType(file);

    if (!directStorageBlocked) {
      try {
        const presignRes = await uploadApi.getPresignedUrl(
          { filename: file.name, contentType, size: file.size, folderId },
          signal,
        );
        const presign = unwrapData<{
          url?: string;
          uploadUrl?: string;
          mimeType?: string;
          key?: string;
          fileId?: string;
          uploadSessionId?: string;
        }>(presignRes.data);
        const url = presign.url ?? presign.uploadUrl;
        if (!url || !presign.key) throw new Error("Could not get an upload URL");
        const signedType = presign.mimeType || contentType;

        for (let attempt = 1; ; attempt += 1) {
          try {
            await putToStorage(url, contentTypedBody(file, signedType), {
              contentType: signedType,
              label: `Upload of ${file.name}`,
              signal,
              onProgress: (loaded) => {
                if (!onProgress || file.size === 0) return;
                const bounded = Math.min(loaded, file.size);
                onProgress(Math.min(99, Math.round((bounded * 100) / file.size)), bounded, file.size);
              },
            });
            break;
          } catch (error) {
            signal?.throwIfAborted();
            if (isStorageBlockedError(error)) throw error;
            if (attempt >= MAX_PART_UPLOAD_RETRIES || !isRetryableUploadError(error)) {
              throw new Error(getPartUploadErrorMessage(error, `Upload of ${file.name}`));
            }
            await waitForUploadRetry(PART_UPLOAD_RETRY_BASE_MS * attempt, signal ?? new AbortController().signal);
          }
        }

        const metadataRes = await filesApi.create({
          key: presign.key,
          originalName: file.name,
          size: file.size,
          mimeType: signedType,
          folderId,
          ...(presign.fileId ? { fileId: presign.fileId } : {}),
          ...(presign.uploadSessionId ? { uploadSessionId: presign.uploadSessionId } : {}),
        });
        onProgress?.(100, file.size, file.size);
        const metadata = unwrapData<Record<string, unknown>>(metadataRes.data);
        return {
          ...metadataRes,
          data: {
            success: true,
            message: "File uploaded successfully",
            data: {
              ...metadata,
              key: (metadata.key as string | undefined) ?? presign.key,
              ...(presign.uploadSessionId ? { uploadSessionId: presign.uploadSessionId } : {}),
            },
          },
        };
      } catch (error) {
        if (!isStorageBlockedError(error)) throw error;
        directStorageBlocked = true;
        if (process.env.NODE_ENV === "development") {
          console.warn("[upload] Direct storage upload blocked; using API fallback.", storageCorsHelp());
        }
      }
    }

    if (file.size > UPLOAD_LIMITS.SIMPLE_MAX_BYTES) {
      // Too big for the API proxy body limit — multipart with server parts is the last resort.
      return uploadApi.uploadMultipartFile(file, folderId, onProgress, signal);
    }

    const formData = new FormData();
    formData.append("file", contentTypedBody(file, contentType), file.name);
    if (folderId) formData.append("folderId", folderId);

    // POST /upload/file — server-side upload to storage (no bucket CORS needed).
    // Content-Type must be unset so the browser can attach the multipart boundary.
    const res = await postUploadForm("/upload/file", formData, {
      signal,
      timeout: SIMPLE_UPLOAD_TIMEOUT_MS,
      headers: { "Content-Type": undefined },
      onUploadProgress: (progressEvent: AxiosProgressEvent) => {
        if (onProgress && progressEvent.total) {
          const loaded = Math.min(progressEvent.loaded, progressEvent.total);
          onProgress(Math.round((loaded * 100) / progressEvent.total), loaded, progressEvent.total);
        }
      },
    });
    notifyAppDataChanged({
      source: "upload",
      files: true,
      folders: Boolean(folderId),
      storage: true,
    });
    return res;
  },

  uploadMultipartFile: async (
    file: File,
    folderId?: string,
    onProgress?: UploadProgressCallback,
    signal?: AbortSignal,
  ): Promise<UploadApiResponse> => {
    signal?.throwIfAborted();
    const contentType = resolveUploadContentType(file);
    const requestedPartSize = choosePartSize(file.size);
    const requestedPartCount = Math.ceil(file.size / requestedPartSize);
    let progressByPart: number[] = [];
    let uploadId = "";
    let key = "";

    const updateProgress = (partIndex: number, loaded: number) => {
      progressByPart[partIndex] = loaded;
      if (!onProgress) return;
      const uploadedBytes = progressByPart.reduce((sum, value) => sum + value, 0);
      const boundedBytes = Math.min(uploadedBytes, file.size);
      onProgress(
        Math.min(99, Math.round((boundedBytes * 100) / file.size)),
        boundedBytes,
        file.size,
      );
    };

    try {
      const initiateRes = await uploadApi.initiateMultipart({
        filename: file.name,
        contentType,
        size: file.size,
        folderId,
        partSize: requestedPartSize,
        // Pre-sign every part URL in one request for typical files; this
        // removes one API round trip per part.
        ...(requestedPartCount <= MAX_UPFRONT_PART_URLS && !directStorageBlocked
          ? { partCount: requestedPartCount }
          : {}),
      }, signal);
      const initiateData = unwrapData<MultipartInitiateData & { urls?: string[] }>(initiateRes.data);
      uploadId = initiateData.uploadId ?? "";
      key = initiateData.key ?? "";
      const resolvedPartSize = initiateData.partSize ?? requestedPartSize;

      if (!uploadId || !key) {
        throw new Error("Could not start multipart upload");
      }

      if (!Number.isFinite(resolvedPartSize) || resolvedPartSize <= 0) {
        throw new Error("Could not start multipart upload with a valid part size");
      }

      const resolvedPartCount = Math.ceil(file.size / resolvedPartSize);
      progressByPart = new Array(resolvedPartCount).fill(0) as number[];
      const partUrls: (string | undefined)[] = Array.isArray(initiateData.urls) &&
        initiateData.urls.length === resolvedPartCount
        ? [...initiateData.urls]
        : [];

      const resolvePartUrl = async (partNumber: number, partSignal: AbortSignal) => {
        const cached = partUrls[partNumber - 1];
        if (cached) return assertUsableUploadUrl(cached, partNumber);
        const partUrlRes = await uploadApi.getPartUrl({ uploadId, key, partNumber }, partSignal);
        const partUrlData = unwrapData<MultipartPartUrlData>(partUrlRes.data);
        const url = partUrlData.url ?? partUrlData.uploadUrl ?? partUrlData.presignedUrl;
        if (!url) throw new Error(`Could not get upload URL for part ${partNumber}`);
        partUrls[partNumber - 1] = url;
        return assertUsableUploadUrl(url, partNumber);
      };

      const partTasks = Array.from({ length: resolvedPartCount }, (_, index) => async (partSignal: AbortSignal) => {
        const partNumber = index + 1;
        const start = index * resolvedPartSize;
        const end = Math.min(start + resolvedPartSize, file.size);
        const chunk = file.slice(start, end);
        const label = `Upload part ${partNumber}`;

        for (let attempt = 1; ; attempt += 1) {
          try {
            partSignal.throwIfAborted();
            let etag: string;
            if (directStorageBlocked) {
              etag = await uploadApi.uploadMultipartPartViaServer(
                { uploadId, key, partNumber, chunk },
                partSignal,
                (loaded) => updateProgress(index, loaded),
              );
            } else {
              const uploadUrl = await resolvePartUrl(partNumber, partSignal);
              try {
                etag = await putToStorage(uploadUrl, chunk, {
                  requireEtag: true,
                  label,
                  signal: partSignal,
                  onProgress: (loaded) => updateProgress(index, loaded),
                });
              } catch (directError) {
                if (!isStorageBlockedError(directError)) throw directError;
                // Bucket CORS blocks this origin: switch every part to the API path.
                directStorageBlocked = true;
                updateProgress(index, 0);
                etag = await uploadApi.uploadMultipartPartViaServer(
                  { uploadId, key, partNumber, chunk },
                  partSignal,
                  (loaded) => updateProgress(index, loaded),
                );
              }
            }
            updateProgress(index, chunk.size);
            return { ETag: etag, PartNumber: partNumber };
          } catch (error) {
            updateProgress(index, 0);
            partSignal.throwIfAborted();
            if (attempt >= MAX_PART_UPLOAD_RETRIES || !isRetryableUploadError(error)) {
              throw new Error(getPartUploadErrorMessage(error, label));
            }
            // Drop a possibly expired presigned URL so the retry gets a fresh one.
            partUrls[index] = undefined;
            await waitForUploadRetry(PART_UPLOAD_RETRY_BASE_MS * attempt * attempt, partSignal);
          }
        }
      });

      const parts = await runUploadTasks(partTasks, UPLOAD_LIMITS.MAX_CONCURRENT_PARTS, signal);
      signal?.throwIfAborted();

      const completeRes = await uploadApi.completeMultipart({ uploadId, key, parts });

      const completePayload = unwrapData<Record<string, unknown>>(completeRes.data);
      const uploadSessionId =
        (completePayload.uploadSessionId as string | undefined) ??
        (initiateData.uploadSessionId ?? initiateData.sessionId ?? initiateData.file?.uploadSessionId);
      const fileId = (initiateData as { fileId?: string }).fileId;

      const metadataRes = await filesApi.create({
        key: (completePayload.key as string | undefined) ?? key,
        originalName: file.name,
        size: file.size,
        mimeType: contentType,
        folderId,
        ...(fileId ? { fileId } : {}),
        ...(uploadSessionId ? { uploadSessionId } : {}),
      });

      const metadataPayload = unwrapData<Record<string, unknown>>(metadataRes.data);
      onProgress?.(100, file.size, file.size);
      const normalizedPayload = {
        ...metadataPayload,
        key: (metadataPayload.key as string | undefined) ?? key,
        ...(uploadSessionId ? { uploadSessionId } : {}),
      };

      return {
        ...metadataRes,
        data: {
          success: true,
          message: "File uploaded successfully",
          data: normalizedPayload,
        },
      };
    } catch (error) {
      if (uploadId && key) {
        try {
          await uploadApi.abortMultipart({ uploadId, key });
        } catch {
          // The original upload error is more useful to surface.
        }
      }
      throw error;
    }
  },

  getPresignedUrl: (data: {
    filename: string;
    contentType: string;
    size: number;
    folderId?: string;
  }, signal?: AbortSignal) => getApi().post("/upload/presigned-url", {
    fileName:  data.filename,
    mimeType:  data.contentType,
    fileSize:  data.size,
    folderId:  data.folderId,
  }, { signal }),

  initiateMultipart: (data: {
    filename: string;
    contentType: string;
    size: number;
    folderId?: string;
    partSize?: number;
    partCount?: number;
  }, signal?: AbortSignal) => getApi().post("/upload/multipart/initiate", {
    fileName:  data.filename,
    mimeType:  data.contentType,
    fileSize:  data.size,
    folderId:  data.folderId,
    partSize:  data.partSize,
    partCount: data.partCount,
  }, { signal, timeout: FINALIZE_TIMEOUT_MS }),

  completeMultipart: (data: {
    uploadId: string;
    key: string;
    parts: { ETag: string; PartNumber: number }[];
  }) => getApi().post("/upload/multipart/complete", {
    uploadId: data.uploadId,
    key: data.key,
    parts: data.parts.map((p) => ({ partNumber: p.PartNumber, etag: p.ETag })),
  }, { timeout: FINALIZE_TIMEOUT_MS }),

  /** Get a presigned URL for uploading a single part (used during multipart). */
  getPartUrl: (data: { uploadId: string; key: string; partNumber: number }, signal?: AbortSignal) =>
    getApi().post("/upload/multipart/part-url", data, { signal }),

  /** Upload one multipart chunk through the API when browser-to-R2 PUT is blocked. */
  uploadMultipartPartViaServer: async (
    data: { uploadId: string; key: string; partNumber: number; chunk: Blob },
    signal?: AbortSignal,
    onProgress?: (loaded: number) => void,
  ): Promise<string> => {
    const formData = new FormData();
    formData.append("uploadId", data.uploadId);
    formData.append("key", data.key);
    formData.append("partNumber", String(data.partNumber));
    formData.append("part", data.chunk, `part-${data.partNumber}`);

    // Same-origin request: carries the session cookies and gets the 401 → refresh
    // retry. (Calling the backend domain directly has no cookies in production,
    // which caused "Invalid or expired token" on live uploads.)
    const res = await getApi().post("/upload/multipart/upload-part", formData, {
      signal,
      timeout: PART_UPLOAD_TIMEOUT_MS,
      headers: { "Content-Type": undefined },
      onUploadProgress: (progressEvent: AxiosProgressEvent) => {
        onProgress?.(progressEvent.loaded);
      },
    });

    const payload = unwrapData<MultipartServerPartData>(res.data);
    const etag = payload.etag ?? payload.eTag ?? payload.ETag;
    if (!etag) {
      throw new Error(`Server upload for part ${data.partNumber} completed without an ETag`);
    }

    return etag.replace(/^"|"$/g, "");
  },

  /** Abort an in-progress multipart upload and free the parts. */
  abortMultipart: (data: { uploadId: string; key: string }) =>
    getApi().post("/upload/multipart/abort", data),

  /** Initiate a folder upload — returns presigned part URLs for all files. */
  folderUpload: (data: {
    folderName: string;
    parentFolderId?: string;
    directories?: string[];
    files: { fileName: string; mimeType: string; fileSize: number; relativePath?: string }[];
  }) => getApi().post("/upload/folder", data),

  /** List the current user's upload sessions. */
  getSessions: (params?: { status?: string; limit?: number }) =>
    getApi().get("/upload/sessions", { params }),

  /** Get a single upload session by ID. */
  getSession: (id: string) => getApi().get(`/upload/sessions/${id}`),

  /** Cancel (abort) an upload session. */
  cancelSession: (id: string) => getApi().delete(`/upload/sessions/${id}`),
};

/* =========================
   FOLDERS API
========================= */

export const foldersApi = {
  create: (data: { name: string; parentId?: string; description?: string; color?: string }) =>
    getApi().post("/folders", data),

  /** Paginated flat list; supports parentId, search, page, limit */
  list: (params?: Record<string, unknown>) =>
    getApi().get("/folders", { params }),

  tree: () => getApi().get("/folders/tree"),

  trash: () => getApi().get("/folders/trash"),

  getById: (id: string) => getApi().get(`/folders/${id}`),

  getContents: (id: string) => getApi().get(`/folders/${id}/contents`),

  getFiles: (id: string, params?: Record<string, unknown>) =>
    getApi().get(`/folders/${id}/files`, { params }),

  update: (id: string, data: { name?: string; description?: string; color?: string }) =>
    getApi().patch(`/folders/${id}`, data),

  move: (id: string, parentId: string | null) =>
    getApi().patch(`/folders/${id}/move`, { parentId }),

  restore: (id: string) => getApi().patch(`/folders/${id}/restore`),

  delete: (id: string) => getApi().delete(`/folders/${id}`),

  hardDelete: (id: string) => getApi().delete(`/folders/${id}/permanent`),

  adminStats: () => getApi().get("/folders/admin/stats"),
};

/* =========================
   SEARCH API
========================= */

export const searchApi = {
  search: (q: string, params?: Record<string, unknown>) =>
    getApi().get("/search", { params: { q, ...params } }),
};

/* =========================
   NOTIFICATIONS API
========================= */

export const notificationsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    getApi().get("/notifications", { params }),

  unreadCount: () => getApi().get("/notifications/unread-count"),

  markRead: (id: string) => getApi().patch(`/notifications/${id}/read`),

  markAllRead: () => getApi().patch("/notifications/read-all"),

  bulkMarkRead: (ids: string[]) =>
    getApi().patch("/notifications/bulk-read", { ids }),

  deleteOne: (id: string) => getApi().delete(`/notifications/${id}`),

  deleteAllRead: () => getApi().delete("/notifications/read"),

  deleteAll: () => getApi().delete("/notifications"),

  adminStats: () => getApi().get("/notifications/admin/stats"),
};

/* =========================
   TRANSACTIONS API
========================= */

export const transactionsApi = {
  list: (params?: Record<string, unknown>) =>
    getApi().get("/transactions", { params }),

  getById: (id: string) => getApi().get(`/transactions/${id}`),

  getByUser: (userId: string) => getApi().get(`/transactions/user/${userId}`),

  getByFile: (fileId: string) => getApi().get(`/transactions/file/${fileId}`),
};

/* =========================
   SHARES API
   Covers public token-access and authenticated CRUD.
========================= */

export const sharesApi = {
  /* ── public (no auth) ── */
  accessViaToken: (token: string, password?: string) =>
    getApi().get(`/shares/link/${token}`, password ? { params: { password } } : {}),

  downloadViaToken: (token: string, password?: string) =>
    getApi().post(`/shares/link/${token}/download`, password ? { password } : {}),

  /** Browse a subfolder within a shared folder. */
  accessViaTokenFolder: (token: string, folderId: string, password?: string) =>
    getApi().get(`/shares/link/${token}/folder/${folderId}`, password ? { params: { password } } : {}),

  /** Download a single file from a shared resource. */
  downloadViaTokenFile: (token: string, fileId: string, password?: string) =>
    getApi().get(`/shares/link/${token}/file/${fileId}/download`, password ? { params: { password } } : {}),

  /* ── authenticated CRUD ── */
  create: (data: {
    resourceType: "file" | "folder";
    resourceId?: string;
    fileId?: string;
    folderId?: string;
    type: "link" | "email" | "private";
    emails?: string[];
    sharedWithEmails?: string[];
    sharedWithUserIds?: string[];
    permission?: "view" | "download";
    expiresAt?: string;
    expiresIn?: number;
    password?: string;
    name?: string;
    message?: string;
  }) => {
    const expiresAt = data.expiresAt
      ?? (data.expiresIn
        ? new Date(Date.now() + data.expiresIn * 86_400_000).toISOString()
        : undefined);
    return getApi().post("/shares", {
      resourceType: data.resourceType,
      fileId: data.fileId ?? (data.resourceType === "file" ? data.resourceId : undefined),
      folderId: data.folderId ?? (data.resourceType === "folder" ? data.resourceId : undefined),
      type: data.type,
      sharedWithEmails: data.sharedWithEmails ?? data.emails,
      sharedWithUserIds: data.sharedWithUserIds,
      permission: data.permission,
      expiresAt,
      password: data.password,
      name: data.name,
      message: data.message,
    });
  },

  list: (params?: { page?: number; limit?: number; type?: string; status?: string }) =>
    getApi().get("/shares", { params }),

  getById: (id: string) => getApi().get(`/shares/${id}`),

  getAccesses: (id: string, params?: { page?: number; limit?: number }) =>
    getApi().get(`/shares/${id}/accesses`, { params }),

  update: (id: string, data: Record<string, unknown>) =>
    getApi().patch(`/shares/${id}`, data),

  revoke: (id: string) => getApi().patch(`/shares/${id}/revoke`),

  delete: (id: string) => getApi().delete(`/shares/${id}`),

  /* ── admin ── */
  adminAll: (params?: Record<string, unknown>) =>
    getApi().get("/shares/admin/all", { params }),

  adminAccesses: (params?: Record<string, unknown>) =>
    getApi().get("/shares/admin/accesses", { params }),

  adminAnalytics: () => getApi().get("/shares/admin/analytics"),
};

/* =========================
   ADMIN API
========================= */

/* =========================
   LINKS API
========================= */

export const linksApi = {
  /* ── public (no auth) ── */

  /** View a share/transfer link by short code. Password optional for protected links. */
  publicView: (shortCode: string, password?: string) =>
    getApi().get(`/links/l/${shortCode}`, password ? { params: { password } } : {}),

  /** Browse a folder inside a share-type link. */
  publicFolderContents: (shortCode: string, folderId: string, password?: string) =>
    getApi().get(`/links/l/${shortCode}/folder/${folderId}`, password ? { params: { password } } : {}),

  /** Get a presigned download URL for a file accessible through the link. */
  publicFileDownload: (shortCode: string, fileId: string, password?: string) =>
    getApi().get(`/links/l/${shortCode}/file/${fileId}/download`, password ? { params: { password } } : {}),

  /* ── user (own links) ── */
  create: (data: {
    resourceType: "file" | "folder";
    resourceId: string;
    method?: "link" | "qr" | "email";
    permission?: "view" | "download";
    privacy?: "public" | "private" | "specific";
    expiresIn?: number;
    password?: string;
    recipients?: string[];
  }) => getApi().post("/links", data),

  list: (params?: { status?: string; method?: "link" | "qr" | "email"; page?: number; limit?: number }) =>
    getApi().get("/links", { params }),

  disable: (id: string) => getApi().patch(`/links/${id}/disable`),
  enable:  (id: string) => getApi().patch(`/links/${id}/enable`),
  delete:  (id: string) => getApi().delete(`/links/${id}`),
  renew:   (id: string, days?: number) => getApi().patch(`/links/${id}/renew`, { days }),
  accesses: (id: string, params?: { page?: number; limit?: number }) =>
    getApi().get(`/links/${id}/accesses`, { params }),

  /* ── admin (all users' links, no ownership check) ── */
  adminList: (params?: { status?: string; method?: "link" | "qr" | "email"; page?: number; limit?: number }) =>
    getApi().get("/links/admin/all", { params }),

  adminDisable: (id: string) => getApi().patch(`/links/admin/${id}/disable`),
  adminEnable:  (id: string) => getApi().patch(`/links/admin/${id}/enable`),
  adminDelete:  (id: string) => getApi().delete(`/links/admin/${id}`),
  adminRenew:   (id: string, days?: number) => getApi().patch(`/links/admin/${id}/renew`, { days }),
};

export const adminApi = {
  overview: () => getApi().get("/admin/overview"),

  /** Superadmin-only full dashboard payload for the improved admin page. */
  dashboard: () => getApi().get("/admin/dashboard"),

  storage: () => getApi().get("/admin/storage"),

  /** Cross-entity activity feed: recent file uploads, transfers, user registrations. */
  activity: (params?: { limit?: number }) =>
    getApi().get("/admin/activity", { params }),

  /** Superadmin audit log view: currently backed by the cross-entity audit/activity stream. */
  auditLogs: (params?: { limit?: number }) =>
    getApi().get("/admin/audit-logs", { params }),

  users: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    isActive?: boolean;
  }) => getApi().get("/admin/users", { params }),

  files: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    mimeType?: string;
    includeTrashed?: boolean;
  }) => getApi().get("/admin/files", { params }),

  shares: (params?: { page?: number; limit?: number }) =>
    getApi().get("/admin/shares", { params }),

  sharesAnalytics: () => getApi().get("/admin/shares/analytics"),

  transfers: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: "active" | "expired" | "disabled";
    method?: "email" | "link" | "qr";
  }) => getApi().get("/admin/transfers", { params }),

  links: (params?: {
    page?: number;
    limit?: number;
    status?: "active" | "expired" | "disabled";
    type?: "share" | "transfer";
  }) => getApi().get("/admin/links", { params }),

  uploadSessions: (params?: {
    page?: number;
    limit?: number;
    status?: "uploading" | "completed" | "failed" | "aborted";
  }) => getApi().get("/admin/upload-sessions", { params }),

  /** Superadmin-only system view with optional service, incident, and runtime details. */
  system: (params?: { include?: string }) => getApi().get("/admin/system", { params }),

  /** Superadmin-only database view with MongoDB collection and storage stats. */
  database: () => getApi().get("/admin/database"),
};

/* =========================
   SUPERADMIN API
   Extends adminApi with an analytics alias (same data, different caller context).
========================= */

export const superadminApi = {
  ...adminApi,
  /** Platform-wide analytics — same data source as overview. */
  analytics: adminApi.overview,
};

/* =========================
   TRANSFERS API
========================= */

export const transfersApi = {
  send: (data: {
    title: string;
    fileIds?: string[];
    fileKeys?: string[];
    /** fileId → relativePath for locally-uploaded files from dragged folders */
    relativePaths?: Record<string, string>;
    method: "email" | "link" | "qr";
    privacy?: "public" | "private" | "specific";
    recipients?: string[];
    subject?: string;
    message?: string;
    expiry?: number;
    expiresAt?: string;
    password?: string;
    totalSize?: number;
    fileCount?: number;
    folderCount?: number;
  }) => getApi().post("/transfers/send", data),

  list: (params?: Record<string, unknown>) =>
    getApi().get("/transfers", { params }),

  getById: (id: string) => getApi().get(`/transfers/${id}`),

  getStats: () => getApi().get("/transfers/stats"),

  received: (params?: Record<string, unknown>) =>
    getApi().get("/transfers/received", { params }),

  starred: (params?: Record<string, unknown>) =>
    getApi().get("/transfers/starred", { params }),

  disable: (id: string) => getApi().patch(`/transfers/${id}/disable`),

  enable: (id: string) => getApi().patch(`/transfers/${id}/enable`),

  extend: (id: string, days = 7) =>
    getApi().patch(`/transfers/${id}/extend`, null, { params: { days } }),

  star: (id: string) => getApi().post(`/transfers/${id}/star`),

  unstar: (id: string) => getApi().delete(`/transfers/${id}/star`),

  delete: (id: string) => getApi().delete(`/transfers/${id}`),

  adminAll: (params?: Record<string, unknown>) =>
    getApi().get("/transfers/admin/all", { params }),

  adminStats: () => getApi().get("/transfers/admin/stats"),
};

/* =========================
   DASHBOARD API
========================= */

export const dashboardApi = {
  /** Transfer stats — works for all authenticated users. */
  getStats: () => getApi().get("/transfers/stats"),

  /** Recent activity — pulls from the transactions log. */
  getRecentActivity: (limit?: number) =>
    getApi().get("/transactions", { params: { limit } }),

  /** Storage — admin/superadmin: team storage; regular user: own profile (has storageUsed). */
  getStorageAnalytics: () => getApi().get("/admin/storage"),
};

/* =========================
   EXPORT ALL
========================= */

const apiClient = {
  auth: authApi,
  users: usersApi,
  files: filesApi,
  folders: foldersApi,
  upload: uploadApi,
  search: searchApi,
  notifications: notificationsApi,
  transactions: transactionsApi,
  transfers: transfersApi,
  shares: sharesApi,
  links: linksApi,
  admin: adminApi,
  superadmin: superadminApi,
  dashboard: dashboardApi,
};

export default apiClient;
