import {
  adminApi,
  filesApi,
  linksApi,
  notificationsApi,
  transfersApi,
  usersApi,
} from "@/lib/api";
import { getLinksFromResponse, getLinkStatusCounts, getTransfersFromResponse } from "@/lib/transfers";

type UnknownRecord = Record<string, unknown>;

export type AdminDashboardUser = UnknownRecord & {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  isActive?: boolean;
  active?: boolean;
  transferCount?: number;
  transfers?: number;
};

export type AdminDashboardActivity = UnknownRecord & {
  id?: string;
  action?: string;
  type?: string;
  description?: string;
  createdAt?: string;
};

export type AdminDashboardCard = {
  id: string;
  label: string;
  value: string | number;
  displayValue?: string;
  subValue?: string;
  trendValue?: number;
  trendLabel?: string;
};

export type AdminDashboardQuickAction = {
  id: string;
  label: string;
  href: string;
};

export type AdminDashboardOverview = {
  totalUsers: number;
  activeUsers: number;
  totalFiles: number;
  totalTransfers: number;
  activeLinks: number;
  expiredLinks: number;
  disabledLinks: number;
  totalDownloads: number;
  totalViews: number;
  totalStorage: number;
  storageQuota: number;
  recentUploads: number;
  recentDownloads: number;
  newUsersToday: number;
  transfersToday: number;
  downloadsToday: number;
  userGrowthPct?: number;
  storageGrowthPct?: number;
};

export type AdminDashboardUserStats = {
  total: number;
  active: number;
  inactive: number;
  byRole: {
    admin: number;
    user: number;
    superadmin: number;
  };
};

export type AdminDashboardData = {
  overview: AdminDashboardOverview;
  userStats: AdminDashboardUserStats;
  storage: { used: number; quota: number };
  teamUsers: AdminDashboardUser[];
  recentActivity: AdminDashboardActivity[];
  auditLogs: AdminDashboardActivity[];
  cards: AdminDashboardCard[];
  quickActions: AdminDashboardQuickAction[];
  systemHealth: UnknownRecord;
  database: UnknownRecord;
  unreadCount: number;
  failedSources: string[];
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function unwrap(payload: unknown): UnknownRecord {
  const root = asRecord(payload);
  const first = asRecord(root.data ?? root);
  return asRecord(first.data ?? first);
}

function readNumber(...values: unknown[]): number {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function readOptionalNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function readArray<T = UnknownRecord>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readItems<T = UnknownRecord>(payload: unknown, keys: string[]): T[] {
  const data = unwrap(payload);
  for (const key of keys) {
    const list = readArray<T>(data[key]);
    if (list.length > 0) return list;
  }
  return readArray<T>(data);
}

function readStorageUsed(data: unknown): number {
  const item = asRecord(data);
  const storage = asRecord(item.storage);
  const summary = asRecord(item.summary);
  return readNumber(
    item.usedBytes,
    storage.usedBytes,
    storage.used,
    storage.totalUsed,
    storage.storageUsed,
    summary.totalUsedBytes,
    summary.totalSizeBytes,
    item.totalUsedBytes,
    item.totalSizeBytes,
    item.totalStorageUsed,
    item.totalStorage,
    item.used,
    item.totalUsed,
    item.storageUsed,
  );
}

function readStorageQuota(data: unknown): number {
  const item = asRecord(data);
  const storage = asRecord(item.storage);
  const summary = asRecord(item.summary);
  return readNumber(
    item.quotaBytes,
    storage.quotaBytes,
    storage.quota,
    storage.totalQuota,
    storage.storageQuota,
    summary.totalQuotaBytes,
    item.totalQuotaBytes,
    item.storageQuota,
    item.quota,
    item.totalQuota,
  );
}

function roleCountsFromUsers(users: AdminDashboardUser[]) {
  return users.reduce<{ admin: number; user: number; superadmin: number }>(
    (acc, user) => {
      const role = String(user.role ?? "user").toLowerCase();
      if (role === "admin") acc.admin += 1;
      else if (role === "superadmin") acc.superadmin += 1;
      else acc.user += 1;
      return acc;
    },
    { admin: 0, user: 0, superadmin: 0 },
  );
}

function activeCountFromUsers(users: AdminDashboardUser[]) {
  return users.filter((user) => {
    const value: unknown = user.isActive ?? user.active;
    if (typeof value === "string") return value.toLowerCase() === "true" || value === "1";
    return Boolean(value);
  }).length;
}

function buildOverview(params: {
  overview: UnknownRecord;
  userStats: UnknownRecord;
  fileStats: UnknownRecord;
  transferStats: UnknownRecord;
  storageRaw: UnknownRecord;
  users: AdminDashboardUser[];
  linkStatusCounts?: {
    active: number;
    expired: number;
    disabled: number;
  };
}) {
  const { overview, userStats, fileStats, transferStats, storageRaw, users, linkStatusCounts } = params;
  const usersOverview = asRecord(overview.users);
  const filesOverview = asRecord(overview.files);
  const storageOverview = asRecord(overview.storage);
  const sharesOverview = asRecord(overview.shares);
  const transfersOverview = asRecord(overview.transfers);
  const linksOverview = asRecord(overview.links);
  const sharingOverview = asRecord(asRecord(overview.analytics).sharing);
  const userRole = asRecord(userStats.byRole);
  const totalUsers = readNumber(overview.totalUsers, usersOverview.total, userStats.total, userStats.totalUsers, users.length);
  const activeUsers = readNumber(overview.activeUsers, usersOverview.active, userStats.active, userStats.activeUsers, activeCountFromUsers(users));
  const storageUsed = readStorageUsed(storageRaw)
    || readNumber(
      overview.totalStorage,
      overview.totalStorageUsed,
      storageOverview.totalBytes,
      storageOverview.usedBytes,
    );
  const storageQuota = readStorageQuota(storageRaw);

  return {
    totalUsers,
    activeUsers,
    totalFiles: readNumber(overview.totalFiles, filesOverview.total, fileStats.totalFiles, fileStats.total, fileStats.files),
    totalTransfers: readNumber(
      overview.totalTransfers,
      transfersOverview.total,
      transferStats.totalTransfers,
      transferStats.total,
      transferStats.transfers,
    ),
    activeLinks: readNumber(linkStatusCounts?.active, overview.activeLinks, linksOverview.active, transferStats.activeLinks),
    expiredLinks: readNumber(linkStatusCounts?.expired, overview.expiredLinks, linksOverview.expired, transferStats.expiredLinks),
    disabledLinks: readNumber(linkStatusCounts?.disabled, overview.disabledLinks, linksOverview.disabled, transferStats.disabledLinks),
    totalDownloads: readNumber(
      overview.totalDownloads,
      overview.recentDownloads,
      sharesOverview.totalDownloads,
      sharingOverview.totalDownloads,
      transferStats.totalDownloads,
      transferStats.downloads,
      fileStats.downloads,
    ),
    totalViews: readNumber(overview.totalViews, sharesOverview.totalViews, sharingOverview.totalViews, transferStats.totalViews, transferStats.views),
    totalStorage: storageUsed,
    storageQuota,
    recentUploads: readNumber(overview.recentUploads, filesOverview.uploadsLast7Days, fileStats.recentUploads, fileStats.uploadsToday),
    recentDownloads: readNumber(overview.recentDownloads, transferStats.recentDownloads, transferStats.downloadsToday),
    newUsersToday: readNumber(overview.newUsersToday, userStats.newUsersToday),
    transfersToday: readNumber(overview.transfersToday, transfersOverview.createdLast7Days, transferStats.transfersToday),
    downloadsToday: readNumber(overview.downloadsToday, transferStats.downloadsToday),
    userGrowthPct: readOptionalNumber(overview.userGrowthPct, userStats.userGrowthPct),
    storageGrowthPct: readOptionalNumber(overview.storageGrowthPct, fileStats.storageGrowthPct),
    byRole: userRole,
  };
}

export async function loadAdminDashboardData(options: { includeSuperAdminDashboard?: boolean } = {}): Promise<AdminDashboardData> {
  const [
    dashboardRes,
    overviewRes,
    storageRes,
    usersRes,
    activityRes,
    userStatsRes,
    unreadRes,
    fileStatsRes,
    transferStatsRes,
    linksRes,
    adminLinksRes,
    adminTransfersRes,
  ] = await Promise.allSettled([
    options.includeSuperAdminDashboard ? adminApi.dashboard() : Promise.resolve({ data: {} }),
    adminApi.overview(),
    adminApi.storage(),
    adminApi.users({ limit: 8 }),
    adminApi.activity({ limit: 50 }),
    usersApi.adminStats(),
    notificationsApi.unreadCount(),
    filesApi.adminStats(),
    transfersApi.adminStats(),
    linksApi.adminList(),
    adminApi.links(),
    adminApi.transfers({ limit: 100 }),
  ]);

  const dashboardRaw = dashboardRes.status === "fulfilled" ? unwrap(dashboardRes.value.data) : {};
  const dashboardRecent = asRecord(dashboardRaw.recent);
  const dashboardOperations = asRecord(dashboardRaw.operations);
  const overviewRaw = overviewRes.status === "fulfilled" ? unwrap(overviewRes.value.data) : {};
  const storageRaw = storageRes.status === "fulfilled" ? unwrap(storageRes.value.data) : {};
  const userStatsRaw = userStatsRes.status === "fulfilled" ? unwrap(userStatsRes.value.data) : {};
  const fileStatsRaw = fileStatsRes.status === "fulfilled" ? unwrap(fileStatsRes.value.data) : {};
  const transferStatsRaw = transferStatsRes.status === "fulfilled" ? unwrap(transferStatsRes.value.data) : {};
  const dashboardUsers = readArray<AdminDashboardUser>(dashboardRecent.users);
  const dashboardActivity = readArray<AdminDashboardActivity>(dashboardRecent.activity);
  const dashboardAuditLogs = readArray<AdminDashboardActivity>(dashboardRecent.auditLogs);
  const apiUsers = usersRes.status === "fulfilled"
    ? readItems<AdminDashboardUser>(usersRes.value.data, ["users", "items"])
    : [];
  const users = apiUsers.length > 0 ? apiUsers : dashboardUsers;
  const apiActivity = activityRes.status === "fulfilled"
    ? readItems<AdminDashboardActivity>(activityRes.value.data, ["activities", "activity", "items"])
    : [];
  const activity = [...dashboardActivity, ...apiActivity].filter((item, index, list) => {
    const key = String(item.id ?? `${item.action ?? item.type}-${item.createdAt ?? ""}-${item.description ?? ""}`);
    return list.findIndex((candidate) => String(candidate.id ?? `${candidate.action ?? candidate.type}-${candidate.createdAt ?? ""}-${candidate.description ?? ""}`) === key) === index;
  });
  const links = linksRes.status === "fulfilled" ? getLinksFromResponse(linksRes.value.data) : [];
  const adminLinks = adminLinksRes.status === "fulfilled" ? getLinksFromResponse(adminLinksRes.value.data) : [];
  const transferLinks = adminTransfersRes.status === "fulfilled"
    ? getTransfersFromResponse(adminTransfersRes.value.data)
      .map((transfer) => transfer.link)
      .filter((link): link is NonNullable<typeof link> => Boolean(link?.status))
    : [];
  const uniqueLinks = [...links, ...adminLinks, ...transferLinks].filter((link, index, list) => {
    const item = asRecord(link);
    const key = String(item.id ?? item._id ?? item.shortCode ?? item.token ?? item.url ?? item.link ?? index);
    return list.findIndex((candidate, candidateIndex) => {
      const record = asRecord(candidate);
      return String(record.id ?? record._id ?? record.shortCode ?? record.token ?? record.url ?? record.link ?? candidateIndex) === key;
    }) === index;
  });
  const transfers = transferStatsRes.status === "fulfilled"
    ? getTransfersFromResponse(transferStatsRes.value.data)
    : [];
  const unreadRaw = unreadRes.status === "fulfilled" ? unwrap(unreadRes.value.data) : {};
  const roleCounts = roleCountsFromUsers(users);
  const totalUsers = readNumber(userStatsRaw.total, userStatsRaw.totalUsers, users.length);
  const activeUsers = readNumber(userStatsRaw.active, userStatsRaw.activeUsers, activeCountFromUsers(users));
  const byRoleRaw = asRecord(userStatsRaw.byRole);
  const dashboardOverview = asRecord(dashboardRaw.overview);
  const mergedOverview = {
    ...overviewRaw,
    ...dashboardOverview,
    users: { ...asRecord(overviewRaw.users), ...asRecord(dashboardOverview.users) },
    files: { ...asRecord(overviewRaw.files), ...asRecord(dashboardOverview.files) },
    storage: { ...asRecord(overviewRaw.storage), ...asRecord(dashboardOverview.storage) },
    shares: { ...asRecord(overviewRaw.shares), ...asRecord(dashboardOverview.shares) },
    transfers: { ...asRecord(overviewRaw.transfers), ...asRecord(dashboardOverview.transfers) },
    links: { ...asRecord(overviewRaw.links), ...asRecord(dashboardOverview.links) },
  };
  const overview = buildOverview({
    overview: mergedOverview,
    userStats: userStatsRaw,
    fileStats: fileStatsRaw,
    transferStats: transferStatsRaw,
    storageRaw,
    users,
    linkStatusCounts: linksRes.status === "fulfilled" || adminLinksRes.status === "fulfilled" || adminTransfersRes.status === "fulfilled"
      ? getLinkStatusCounts(uniqueLinks)
      : undefined,
  });

  const sourceResults: Array<[string, PromiseSettledResult<unknown>]> = [
    ["dashboard", dashboardRes],
    ["overview", overviewRes],
    ["storage", storageRes],
    ["users", usersRes],
    ["activity", activityRes],
    ["user statistics", userStatsRes],
    ["notifications", unreadRes],
    ["file statistics", fileStatsRes],
    ["transfer statistics", transferStatsRes],
    ["links", linksRes],
    ["admin links", adminLinksRes],
    ["admin transfers", adminTransfersRes],
  ];
  const failedSources = sourceResults
    .filter(([, result]) => result.status === "rejected")
    .map(([label]) => label);

  return {
    overview: {
      ...overview,
      totalTransfers: overview.totalTransfers || transfers.length,
    },
    userStats: {
      total: totalUsers || overview.totalUsers,
      active: activeUsers || overview.activeUsers,
      inactive: readNumber(userStatsRaw.inactive, userStatsRaw.inactiveUsers) || Math.max((totalUsers || overview.totalUsers) - (activeUsers || overview.activeUsers), 0),
      byRole: {
        admin: readNumber(byRoleRaw.admin, userStatsRaw.admin, roleCounts.admin),
        user: readNumber(byRoleRaw.user, userStatsRaw.users, userStatsRaw.user, roleCounts.user),
        superadmin: readNumber(byRoleRaw.superadmin, userStatsRaw.superadmin, roleCounts.superadmin),
      },
    },
    storage: {
      used: overview.totalStorage,
      quota: overview.storageQuota,
    },
    teamUsers: users,
    recentActivity: activity.slice(0, 8),
    auditLogs: dashboardAuditLogs.slice(0, 12),
    cards: readArray<AdminDashboardCard>(dashboardRaw.cards),
    quickActions: readArray<AdminDashboardQuickAction>(dashboardRaw.quickActions),
    systemHealth: asRecord(dashboardOperations.systemHealth),
    database: asRecord(dashboardOperations.database),
    unreadCount: readNumber(unreadRaw.count, unreadRaw.unreadCount, unreadRaw.unread, unreadRaw.total),
    failedSources,
  };
}
