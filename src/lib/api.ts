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

/* =========================
   CONFIG
========================= */

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const configuredBackendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : "https://jai-file-transfer-server.vercel.app");
const BACKEND_URL = configuredBackendUrl
  ? `${/^https?:\/\//i.test(configuredBackendUrl) ? "" : "https://"}${configuredBackendUrl}`.replace(
      /\/(?:api\/v1)?\/?$/i,
      "",
    )
  : undefined;
const DIRECT_BACKEND_API_URL = BACKEND_URL ? `${BACKEND_URL}/api/v1` : undefined;
const MAX_429_RETRIES = 3;
const DEFAULT_429_WAIT_MS = 5000;
const MAX_429_WAIT_MS = 30000;
const MAX_PART_UPLOAD_RETRIES = 3;
const PART_UPLOAD_RETRY_BASE_MS = 1000;
const SIMPLE_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const PART_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function putPresignedPart(
  url: string,
  chunk: Blob,
  partNumber: number,
  signal: AbortSignal | undefined,
  onProgress: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

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

    signal?.addEventListener("abort", abort, { once: true });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    };

    xhr.onerror = () => {
      fail(new Error("ERR_NETWORK"));
    };

    xhr.ontimeout = () => {
      fail(new Error(`Upload part ${partNumber} timed out`));
    };

    xhr.onabort = () => {
      fail(new DOMException("Upload aborted", "AbortError"));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        fail(new Error(`HTTP ${xhr.status}`));
        return;
      }

      const etag = xhr.getResponseHeader("ETag")?.replace(/^"|"$/g, "");
      if (!etag) {
        fail(new Error(`Upload part ${partNumber} completed without an ETag`));
        return;
      }

      cleanup();
      resolve(etag);
    };

    xhr.send(chunk);
  });
}

function isRetryableUploadError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof Error) {
    if (error.message === "ERR_NETWORK") return true;
    if (error.message.includes("timed out")) return true;
    if (/^HTTP (429|5\d\d)$/.test(error.message)) return true;
    if (/^HTTP \d+$/.test(error.message)) return false;
  }
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  const status = error.response.status;
  return status === 429 || status >= 500;
}

function shouldFallbackToServerPartUpload(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message === "ERR_NETWORK" || error.message.includes("timed out");
  }
  return axios.isAxiosError(error) && !error.response;
}

function getPartUploadErrorMessage(error: unknown, partNumber: number): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Upload canceled";
  }

  if (error instanceof Error && error.message === "ERR_NETWORK") {
    return [
      `Network error while uploading part ${partNumber}.`,
      "Browser reported: ERR_NETWORK.",
      "Check the R2 bucket CORS AllowedOrigins/AllowedMethods/AllowedHeaders and the presigned upload URL.",
    ].join(" ");
  }

  if (error instanceof Error && /^HTTP \d+$/.test(error.message)) {
    return `Upload part ${partNumber} failed with ${error.message}`;
  }

  if (axios.isAxiosError(error) && !error.response) {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (isOffline) return "You appear to be offline. Check your connection.";
    const detail = error.code || error.message;
    return [
      `Network error while uploading part ${partNumber}.`,
      detail ? `Browser reported: ${detail}.` : "",
      "Check storage CORS and the presigned upload URL.",
    ].filter(Boolean).join(" ");
  }

  if (axios.isAxiosError(error) && error.response?.status) {
    return `Upload part ${partNumber} failed with HTTP ${error.response.status}`;
  }

  return (error as Error)?.message || `Upload part ${partNumber} failed`;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  ts: "video/mp2t",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  flac: "audio/flac",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
};

function resolveUploadContentType(file: File): string {
  const browserType = file.type?.trim();
  if (browserType && browserType !== "application/octet-stream") {
    return browserType;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  return (extension && MIME_BY_EXTENSION[extension]) || browserType || "application/octet-stream";
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
    timeout: 60000,
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

function getLargeUploadApi(): AxiosInstance {
  if (!DIRECT_BACKEND_API_URL) return getApi();

  return axios.create({
    baseURL: DIRECT_BACKEND_API_URL,
    withCredentials: true,
    timeout: PART_UPLOAD_TIMEOUT_MS,
  });
}

function shouldFallbackToProxy(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

async function postUploadForm(
  path: string,
  formData: FormData,
  config: AxiosRequestConfig<FormData>,
): Promise<UploadApiResponse> {
  if (!DIRECT_BACKEND_API_URL) {
    return getApi().post(path, formData, config);
  }

  try {
    return await getLargeUploadApi().post(path, formData, config);
  } catch (error) {
    if (shouldFallbackToProxy(error)) {
      return getApi().post(path, formData, config);
    }
    throw error;
  }
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

  /** Own profile */
  me: () => getApi().get("/users/me"),

  /** Update own profile (name/department/phone/avatar only) */
  updateMe: (data: Record<string, unknown>) => getApi().patch("/users/me", data),

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
  myStorage: () => getApi().get("/users/me/storage"),

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
    const res = await getApi().post("/files", data);
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
    key: string;
    originalName: string;
    size: number;
    mimeType: string;
    folderId?: string;
    uploadSessionId?: string;
    relativePath?: string;
    tags?: string[];
  }[]) => {
    const res = await getApi().post("/files/batch", { files });
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
    if (file.size > UPLOAD_LIMITS.MAX_FILE_BYTES) {
      throw new Error(`File is larger than ${Math.round(UPLOAD_LIMITS.MAX_FILE_BYTES / 1024 ** 3)} GB`);
    }

    if (file.size >= UPLOAD_LIMITS.MULTIPART_THRESHOLD) {
      return uploadApi.uploadMultipartFile(file, folderId, onProgress, signal);
    }

    const formData = new FormData();
    formData.append("file", file);
    if (folderId) formData.append("folderId", folderId);

    // POST /upload/file — server-side upload to R2 (no browser CORS needed).
    // Content-Type must be unset so the browser can attach the multipart boundary.
    return postUploadForm("/upload/file", formData, {
      signal,
      timeout: SIMPLE_UPLOAD_TIMEOUT_MS,
      headers: { "Content-Type": undefined },
      onUploadProgress: (progressEvent: AxiosProgressEvent) => {
        if (onProgress && progressEvent.total) {
          const loaded = Math.min(progressEvent.loaded, progressEvent.total);
          const percent = Math.round(
            (loaded * 100) / progressEvent.total,
          );
          onProgress(percent, loaded, progressEvent.total);
        }
      },
    }).then((res) => {
      notifyAppDataChanged({
        source: "upload",
        files: true,
        folders: Boolean(folderId),
        storage: true,
      });
      return res;
    });
  },

  uploadMultipartFile: async (
    file: File,
    folderId?: string,
    onProgress?: UploadProgressCallback,
    signal?: AbortSignal,
  ): Promise<UploadApiResponse> => {
    const contentType = resolveUploadContentType(file);
    const requestedPartSize = UPLOAD_LIMITS.PART_SIZE;
    let progressByPart: number[] = [];
    let uploadId = "";
    let key = "";
    let useServerPartUpload = false;

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
      });
      const initiateData = unwrapData<MultipartInitiateData>(initiateRes.data);
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
      const usedPartUrls = new Map<string, number>();

      const partTasks = Array.from({ length: resolvedPartCount }, (_, index) => async () => {
        const partNumber = index + 1;
        const start = index * resolvedPartSize;
        const end = Math.min(start + resolvedPartSize, file.size);
        const chunk = file.slice(start, end);

        for (let attempt = 1; attempt <= MAX_PART_UPLOAD_RETRIES; attempt += 1) {
          try {
            const partUrlRes = await uploadApi.getPartUrl({ uploadId, key, partNumber });
            const partUrlData = unwrapData<MultipartPartUrlData>(partUrlRes.data);
            const url = partUrlData.url ?? partUrlData.uploadUrl ?? partUrlData.presignedUrl;

            if (!url) {
              throw new Error(`Could not get upload URL for part ${partNumber}`);
            }

            const uploadUrl = assertUsableUploadUrl(url, partNumber);
            const existingPartNumber = usedPartUrls.get(uploadUrl);
            if (existingPartNumber !== undefined && existingPartNumber !== partNumber) {
              throw new Error(
                `Upload URL for part ${partNumber} was already issued for part ${existingPartNumber}`,
              );
            }
            usedPartUrls.set(uploadUrl, partNumber);

            let etag: string;
            if (useServerPartUpload) {
              etag = await uploadApi.uploadMultipartPartViaServer(
                {
                  uploadId,
                  key,
                  partNumber,
                  chunk,
                },
                signal,
                (loaded) => updateProgress(index, loaded),
              );
            } else {
              try {
                etag = await putPresignedPart(
                  uploadUrl,
                  chunk,
                  partNumber,
                  signal,
                  (loaded) => updateProgress(index, loaded),
                );
              } catch (directError) {
                if (!shouldFallbackToServerPartUpload(directError)) throw directError;
                useServerPartUpload = true;
                etag = await uploadApi.uploadMultipartPartViaServer(
                  {
                    uploadId,
                    key,
                    partNumber,
                    chunk,
                  },
                  signal,
                  (loaded) => updateProgress(index, loaded),
                );
              }
            }
            updateProgress(index, chunk.size);

            return { ETag: etag, PartNumber: partNumber };
          } catch (error) {
            updateProgress(index, 0);
            if (attempt >= MAX_PART_UPLOAD_RETRIES || !isRetryableUploadError(error)) {
              throw new Error(getPartUploadErrorMessage(error, partNumber));
            }
            await sleep(PART_UPLOAD_RETRY_BASE_MS * attempt);
          }
        }

        throw new Error(`Upload part ${partNumber} failed`);
      });

      const parts: { ETag: string; PartNumber: number }[] = new Array(resolvedPartCount);
      let next = 0;
      async function worker() {
        while (next < partTasks.length) {
          const index = next++;
          parts[index] = await partTasks[index]();
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_LIMITS.MAX_CONCURRENT_PARTS, partTasks.length) }, worker),
      );

      const completeRes = await uploadApi.completeMultipart({ uploadId, key, parts });
      onProgress?.(100, file.size, file.size);

      const completePayload = unwrapData<Record<string, unknown>>(completeRes.data);
      const uploadSessionId =
        (completePayload.uploadSessionId as string | undefined) ??
        (initiateData.uploadSessionId ?? initiateData.sessionId ?? initiateData.file?.uploadSessionId);

      const metadataRes = await filesApi.create({
        key: (completePayload.key as string | undefined) ?? key,
        originalName: file.name,
        size: file.size,
        mimeType: contentType,
        folderId,
        ...(uploadSessionId ? { uploadSessionId } : {}),
      });

      const metadataPayload = unwrapData<Record<string, unknown>>(metadataRes.data);
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
  }) => getApi().post("/upload/presigned-url", {
    fileName:  data.filename,
    mimeType:  data.contentType,
    fileSize:  data.size,
    folderId:  data.folderId,
  }),

  initiateMultipart: (data: {
    filename: string;
    contentType: string;
    size: number;
    folderId?: string;
    partSize?: number;
  }) => getApi().post("/upload/multipart/initiate", {
    fileName:  data.filename,
    mimeType:  data.contentType,
    fileSize:  data.size,
    folderId:  data.folderId,
    partSize:  data.partSize,
  }),

  completeMultipart: (data: {
    uploadId: string;
    key: string;
    parts: { ETag: string; PartNumber: number }[];
  }) => getApi().post("/upload/multipart/complete", {
    uploadId: data.uploadId,
    key: data.key,
    parts: data.parts.map((p) => ({ partNumber: p.PartNumber, etag: p.ETag })),
  }),

  /** Get a presigned URL for uploading a single part (used during multipart). */
  getPartUrl: (data: { uploadId: string; key: string; partNumber: number }) =>
    getApi().post("/upload/multipart/part-url", data),

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

    const res = await getLargeUploadApi().post("/upload/multipart/upload-part", formData, {
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
