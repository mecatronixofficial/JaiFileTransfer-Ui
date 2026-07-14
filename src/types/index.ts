/* ─── API response wrappers ─── */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/* ─── Role alias ─── */

export type UserRole = 'superadmin' | 'admin' | 'user';

export interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId?: string | null;
  isActive: boolean;
  isEmailVerified?: boolean;
  twoFactorEnabled?: boolean;
  workspacePreferences?: {
    language?: "en" | "hi" | "ta";
    timeFormat?: "12" | "24";
  };
  storageUsed: number;
  storageQuota: number;
  storage?: {
    usedBytes?: number;
    quotaBytes?: number;
    remainingBytes?: number;
    fileCount?: number;
    usagePercent?: number;
  };
  department?: string | null;
  phone?: string | null;
  lastLoginAt?: string | null;
  lastIp?: string | null;
  lastUserAgent?: string | null;
  createdAt: string;
  updatedAt: string;
  avatar?: string;
}

export interface FileItem {
  id: string;
  _id?: string;
  name: string;
  fileName?: string;
  originalName: string;
  size: number;
  mimeType: string;
  extension: string;
  key?: string;
  storageProvider?: string;
  status?: 'active' | 'trashed' | 'deleted' | 'processing';
  uploadSessionId?: string | null;
  organizationId?: string | null;
  url?: string;
  thumbnailUrl?: string;
  folderId?: string;
  ownerId: string;
  owner?: User;
  tags?: string[];
  description?: string;
  isShared: boolean;
  sharedWith?: ShareEntry[];
  isStarred?: boolean;
  starredAt?: string;
  isTrashed: boolean;
  trashedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShareEntry {
  userId: string;
  user?: User;
  permission: 'view' | 'edit' | 'admin';
  sharedAt: string;
}

export interface Folder {
  id: string;
  _id?: string;
  name: string;
  organizationId?: string | null;
  status?: 'active' | 'trashed' | 'deleted';
  path?: string;
  description?: string;
  parentId?: string;
  parent?: Folder;
  children?: Folder[];
  files?: FileItem[];
  color?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  fileCount?: number;
  subfolderCount?: number;
  hasChildren?: boolean;
  totalSize?: number;
}

export interface Transaction {
  id: string;
  organizationId?: string | null;
  /** Backend field is `action` (TransactionAction enum). Some endpoints alias it to `type`. */
  action: string;
  type?: string;
  targetType?: 'user' | 'file' | 'folder' | 'transfer' | 'link' | 'upload' | 'system' | null;
  targetId?: string | null;
  fileId?: string;
  file?: FileItem;
  folderId?: string;
  transferId?: string;
  linkId?: string;
  userId: string;
  user?: User;
  ip?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Notification {
  id: string;
  organizationId?: string | null;
  /** Backend notification type string — e.g. file_shared, file_deleted, transfer_sent, system */
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  userId: string;
  targetType?: 'file' | 'folder' | 'transfer' | 'link' | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface StorageInfo {
  used: number;
  quota: number;
  percentage: number;
  breakdown?: {
    images: number;
    videos: number;
    documents: number;
    other: number;
  };
}

export interface AdminOverview {
  totalUsers: number;
  activeUsers: number;
  totalFiles: number;
  totalStorage: number;
  recentUploads: number;
  recentDownloads: number;
}

export interface UploadProgress {
  fileId: string;
  uploadSessionId?: string;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export interface UploadSession {
  id: string;
  userId: string;
  organizationId?: string | null;
  folderId?: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  uploadId?: string | null;
  uploadType: 'single' | 'multipart';
  status: 'uploading' | 'completed' | 'failed' | 'aborted';
  partsCount: number;
  createdAt: string;
  completedAt?: string | null;
}

export interface UploadStartResult {
  url?: string;
  uploadUrl?: string;
  urls?: string[];
  key: string;
  fileId: string;
  uploadId?: string;
  uploadSessionId?: string;
  partSize?: number;
  expiresIn?: number;
}

/* ─── Transfer & Link types ─── */

export type TransferStatus = 'active' | 'expired' | 'disabled' | 'pending';
export type TransferPrivacy = 'public' | 'private' | 'specific';
export type TransferExpiry = '1d' | '7d' | '30d' | 'custom' | 'never';

export interface TransferFile {
  id: string;
  fileId?: string;
  name: string;
  originalName?: string;
  key?: string;
  size: number;
  mimeType: string;
  extension: string;
  url?: string;
  /** Full relative path preserving folder structure, e.g. "vacation/photos/img.jpg" */
  relativePath?: string | null;
}

export interface TransferFolder {
  id?: string;
  name: string;
  path?: string;
  fileCount?: number;
  size?: number;
}

export interface ViewerDetail {
  id: string;
  name?: string;
  email?: string;
  ip?: string;
  device?: string;
  browser?: string;
  os?: string;
  location?: string;
  viewedAt: string;
  downloadedAt?: string;
  action: 'view' | 'download';
}

export interface TransferActivity {
  id: string;
  action:
    | 'created'
    | 'view'
    | 'download'
    | 'viewed'
    | 'downloaded'
    | 'link_disabled'
    | 'link_enabled'
    | 'expiry_extended'
    | 'password_set'
    | 'password_removed'
    | 'recipient_added'
    | 'forwarded'
    | string;
  description: string;
  actor?: string;
  actorEmail?: string;
  ip?: string;
  location?: string;
  createdAt: string;
}

export interface SharedLink {
  id: string;
  /** Null for standalone share links that aren't tied to a specific transfer. */
  transferId: string | null;
  user?: Pick<User, "id" | "name" | "email">;
  transferTitle?: string;
  type: 'share' | 'transfer';
  url: string;
  shortCode: string;
  status: 'active' | 'expired' | 'disabled';
  permission: 'view' | 'download';
  views: number;
  downloads: number;
  lastViewedAt?: string;
  lastDownloadedAt?: string;
  expiresAt?: string;
  hasPassword: boolean;
  privacy?: "public" | "private" | "specific";
  /** File IDs directly attached to a share-type link. */
  fileIds?: string[];
  /** Folder IDs directly attached to a share-type link. */
  folderIds?: string[];
  createdAt: string;
  fileCount?: number;
  totalSize?: number;
}

export type TransferMethod = 'email' | 'link' | 'qr';

export interface Transfer {
  id: string;
  organizationId?: string | null;
  title: string;
  message?: string;
  subject?: string;
  method?: TransferMethod;
  fileIds?: string[];
  folderIds?: string[];
  linkId?: string | null;
  files: TransferFile[];
  folders?: TransferFolder[];
  totalSize: number;
  fileCount: number;
  folderCount?: number;
  recipients: string[];
  senderId: string;
  sender?: User;
  privacy: TransferPrivacy;
  status: TransferStatus;
  expiresAt?: string;
  hasPassword: boolean;
  link?: SharedLink;
  views: number;
  downloads: number;
  lastViewedAt?: string;
  lastDownloadedAt?: string;
  viewerDetails?: ViewerDetail[];
  activity?: TransferActivity[];
  isReceived?: boolean;
  isStarred?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MailLog {
  id: string;
  userId?: string | null;
  organizationId?: string | null;
  transferId?: string | null;
  linkId?: string | null;
  recipientEmail: string;
  type: string;
  subject: string;
  provider: string;
  providerMessageId?: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'complained';
  error?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  sentAt?: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId?: string;
  actorId: string;
  actor?: User;
  actorIp?: string;
  actorDevice?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  dbConnections: number;
  dbMaxConnections?: number;
  activeRequests: number;
  errorRate: number;
  requestsPerMinute?: number;
  avgResponseMs?: number;
  p95ResponseMs?: number;
  environment?: string;
  region?: string;
  version?: string;
  nodeVersion?: string;
  hostname?: string;
  startedAt?: string;
  lastChecked: string;
  services?: {
    id?: string;
    name: string;
    status: 'operational' | 'degraded' | 'down' | 'maintenance';
    latencyMs?: number;
    uptime?: number;
    checkedAt?: string;
    message?: string;
  }[];
  recentErrors?: {
    id?: string;
    code?: number | string;
    message: string;
    count?: number;
    lastAt?: string;
    path?: string;
    service?: string;
  }[];
}

/* ─── Public link viewer types ─── */

export interface PublicLinkFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  extension: string;
}

export interface PublicLinkFolder {
  id: string;
  name: string;
  path: string;
  description?: string;
  fileCount: number;
  subfolderCount: number;
  hasChildren: boolean;
}

export interface PublicLinkMeta {
  id: string;
  shortCode: string;
  url: string;
  type: 'share' | 'transfer';
  status: 'active' | 'expired' | 'disabled';
  permission: 'view' | 'download';
  privacy: string;
  hasPassword: boolean;
  fileCount: number;
  totalSize: number;
  expiresAt?: string;
  views: number;
  downloads: number;
  createdAt: string;
}

export interface PublicLinkView {
  link: PublicLinkMeta;
  type: 'share' | 'transfer';
  files: PublicLinkFile[];
  folders: PublicLinkFolder[];
}

export interface PublicFolderContents {
  folder: {
    id: string;
    name: string;
    path: string;
    description?: string;
    parentId?: string | null;
  };
  breadcrumb: { id: string; name: string }[];
  subfolders: PublicLinkFolder[];
  files: PublicLinkFile[];
  stats: { subfolderCount: number; fileCount: number };
}

/* ─── Share ─── */

export interface Share {
  id: string;
  resourceType: 'file' | 'folder';
  fileId?: string;
  folderId?: string;
  file?: FileItem;
  folder?: Folder;
  type: 'link' | 'email' | 'private';
  sharedWithEmails?: string[];
  sharedWithUserIds?: string[];
  sharedWithUsers?: User[];
  permission: 'view' | 'download';
  ownerId: string;
  owner?: Pick<User, 'id' | 'name' | 'email'>;
  status: 'active' | 'revoked' | 'expired';
  expiresAt?: string;
  hasPassword: boolean;
  name?: string;
  message?: string;
  views: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformAnalytics {
  totalUsers: number;
  totalAdmins: number;
  totalTransfers: number;
  totalStorage: number;
  totalDownloads: number;
  totalViews: number;
  activeLinks: number;
  expiredLinks: number;
  disabledLinks: number;
  newUsersToday: number;
  transfersToday: number;
  downloadsToday: number;
  storageGrowthPct: number;
  userGrowthPct: number;
}
