import { adminApi } from "@/lib/api";

type UnknownRecord = Record<string, unknown>;

export interface AnalyticsBreakdownRow {
  key: string;
  label: string;
  count: number;
  bytes?: number;
  percentage: number;
}

export interface TopSharedFile {
  id: string;
  name: string;
  owner: string;
  type: string;
  permission: string;
  views: number;
  downloads: number;
}

export interface AdminAnalyticsData {
  totalUsers: number;
  activeUsers: number;
  totalFiles: number;
  filesInTrash: number;
  totalStorage: number;
  totalTransfers: number;
  activeTransfers: number;
  transfersToday: number;
  uploadsToday: number;
  newUsersToday: number;
  downloadsToday: number;
  totalLinks: number;
  activeLinks: number;
  expiredLinks: number;
  disabledLinks: number;
  linkViews: number;
  linkDownloads: number;
  totalShares: number;
  activeShares: number;
  revokedShares: number;
  shareViews: number;
  shareDownloads: number;
  transferMethods: AnalyticsBreakdownRow[];
  storageCategories: AnalyticsBreakdownRow[];
  shareTypes: AnalyticsBreakdownRow[];
  sharePermissions: AnalyticsBreakdownRow[];
  topSharedFiles: TopSharedFile[];
  failedSources: string[];
  generatedAt: string;
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function unwrap(value: unknown): UnknownRecord {
  const root = asRecord(value);
  const first = asRecord(root.data ?? root);
  return asRecord(first.data ?? first);
}

function readNumber(...values: unknown[]): number {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function percentage(value: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((value / total) * 1000) / 10) : 0;
}

function readPaginationTotal(value: unknown): number {
  const data = unwrap(value);
  const pagination = asRecord(data.pagination ?? data.meta);
  return readNumber(pagination.total, data.total, data.count);
}

function breakdownRows(
  value: unknown,
  labels: Record<string, string>,
): AnalyticsBreakdownRow[] {
  const rows = Array.isArray(value) ? value : [];
  const parsed = rows.map((item) => {
    const row = asRecord(item);
    const key = readString(row.category ?? row._id ?? row.type, "other").toLowerCase();
    return {
      key,
      label: labels[key] ?? key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      count: readNumber(row.count, row.total),
      bytes: readNumber(row.totalSizeBytes, row.totalSize),
      suppliedPercentage: readNumber(row.usagePercent, row.pct, row.percent),
    };
  });
  const totalCount = parsed.reduce((sum, row) => sum + row.count, 0);
  const totalBytes = parsed.reduce((sum, row) => sum + row.bytes, 0);
  return parsed
    .map(({ suppliedPercentage, ...row }) => ({
      ...row,
      percentage:
        suppliedPercentage ||
        (totalBytes > 0
          ? percentage(row.bytes, totalBytes)
          : percentage(row.count, totalCount)),
    }))
    .sort((a, b) => b.count - a.count);
}

function mapTopSharedFiles(value: unknown): TopSharedFile[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row = asRecord(item);
    const file = asRecord(row.file);
    const owner = asRecord(row.owner);
    return {
      id: readString(row.id ?? row._id ?? row.shareToken, `share-${index}`),
      name: readString(file.originalName ?? file.fileName, "Untitled file"),
      owner: readString(owner.name ?? owner.email, "Unknown owner"),
      type: readString(row.type, "link"),
      permission: readString(row.permission, "view"),
      views: readNumber(row.viewCount, row.views),
      downloads: readNumber(row.downloadCount, row.downloads),
    };
  });
}

export async function loadAdminAnalytics(): Promise<AdminAnalyticsData> {
  const sourceLabels = [
    "overview",
    "storage",
    "sharing analytics",
    "link transfers",
    "QR transfers",
    "email transfers",
  ];
  const results = await Promise.allSettled([
    adminApi.overview(),
    adminApi.storage(),
    adminApi.sharesAnalytics(),
    adminApi.transfers({ page: 1, limit: 1, method: "link" }),
    adminApi.transfers({ page: 1, limit: 1, method: "qr" }),
    adminApi.transfers({ page: 1, limit: 1, method: "email" }),
  ]);

  const failedSources = results
    .map((result, index) => (result.status === "rejected" ? sourceLabels[index] : null))
    .filter((label): label is string => label !== null);

  const overview = results[0].status === "fulfilled" ? unwrap(results[0].value.data) : {};
  const storage = results[1].status === "fulfilled" ? unwrap(results[1].value.data) : {};
  const sharing = results[2].status === "fulfilled" ? unwrap(results[2].value.data) : {};
  const users = asRecord(overview.users);
  const files = asRecord(overview.files);
  const overviewStorage = asRecord(overview.storage);
  const transfers = asRecord(overview.transfers);
  const links = asRecord(overview.links);
  const shareOverview = asRecord(sharing.overview);
  const shareBreakdown = asRecord(sharing.breakdown);
  const storageSummary = asRecord(storage.summary);

  const methodCounts = [
    results[3].status === "fulfilled" ? readPaginationTotal(results[3].value.data) : 0,
    results[4].status === "fulfilled" ? readPaginationTotal(results[4].value.data) : 0,
    results[5].status === "fulfilled" ? readPaginationTotal(results[5].value.data) : 0,
  ];
  const methodTotal = methodCounts.reduce((sum, count) => sum + count, 0);
  const transferMethods: AnalyticsBreakdownRow[] = [
    { key: "link", label: "Link", count: methodCounts[0], percentage: percentage(methodCounts[0], methodTotal) },
    { key: "qr", label: "QR code", count: methodCounts[1], percentage: percentage(methodCounts[1], methodTotal) },
    { key: "email", label: "Email", count: methodCounts[2], percentage: percentage(methodCounts[2], methodTotal) },
  ];

  return {
    totalUsers: readNumber(users.total, overview.totalUsers),
    activeUsers: readNumber(users.active, overview.activeUsers),
    totalFiles: readNumber(files.total, overview.totalFiles, storageSummary.totalFiles),
    filesInTrash: readNumber(files.inTrash),
    totalStorage: readNumber(overviewStorage.totalBytes, overview.totalStorage, storageSummary.totalSizeBytes),
    totalTransfers: readNumber(transfers.total, overview.totalTransfers),
    activeTransfers: readNumber(transfers.active),
    transfersToday: readNumber(overview.transfersToday),
    uploadsToday: readNumber(overview.uploadsToday, overview.recentUploads),
    newUsersToday: readNumber(overview.newUsersToday),
    downloadsToday: readNumber(overview.downloadsToday),
    totalLinks: readNumber(links.total, overview.totalLinks),
    activeLinks: readNumber(links.active, overview.activeLinks),
    expiredLinks: readNumber(links.expired, overview.expiredLinks),
    disabledLinks: readNumber(links.disabled, overview.disabledLinks),
    linkViews: readNumber(overview.totalViews),
    linkDownloads: readNumber(overview.totalDownloads),
    totalShares: readNumber(shareOverview.totalShares),
    activeShares: readNumber(shareOverview.activeShares),
    revokedShares: readNumber(shareOverview.revokedShares),
    shareViews: readNumber(shareOverview.totalViews),
    shareDownloads: readNumber(shareOverview.totalDownloads),
    transferMethods,
    storageCategories: breakdownRows(storage.byCategory, {
      images: "Images",
      documents: "Documents",
      pdfs: "PDFs",
      spreadsheets: "Spreadsheets",
      videos: "Videos",
      other: "Other",
    }),
    shareTypes: breakdownRows(shareBreakdown.byType, {
      link: "Public links",
      email: "Email shares",
      private: "Private shares",
    }),
    sharePermissions: breakdownRows(shareBreakdown.byPermission, {
      view: "View only",
      download: "Download allowed",
    }),
    topSharedFiles: mapTopSharedFiles(sharing.topSharedFiles),
    failedSources,
    generatedAt: new Date().toISOString(),
  };
}
