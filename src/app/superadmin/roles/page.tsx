"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Crown,
  LockKeyhole,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { Badge, Spinner } from "@/components/ui";
import Button from "@/components/ui/Button";
import { usersApi } from "@/lib/api";
import { handleApiError } from "@/lib/error-handler";

type RoleKey = "superadmin" | "admin" | "user";
type PermissionGroup = "workspace" | "sharing" | "administration" | "system";

interface Permission {
  key: string;
  label: string;
  description: string;
  group: PermissionGroup;
  grants: Record<RoleKey, boolean>;
}

interface RoleDef {
  key: RoleKey;
  label: string;
  summary: string;
  scope: string;
  icon: React.ReactNode;
  tone: string;
  badge: "danger" | "warning" | "default";
}

const ROLES: RoleDef[] = [
  {
    key: "superadmin",
    label: "Super Admin",
    summary: "Full platform owner access for system, database, audit, users, and policy controls.",
    scope: "All organizations and all platform modules",
    icon: <Shield size={18} />,
    tone: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300",
    badge: "danger",
  },
  {
    key: "admin",
    label: "Admin",
    summary: "Operational access for user, file, transfer, link, storage, reports, and team activity management.",
    scope: "Managed users and admin modules",
    icon: <Crown size={18} />,
    tone: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300",
    badge: "warning",
  },
  {
    key: "user",
    label: "User",
    summary: "Standard workspace access for personal files, folders, transfers, and shared links.",
    scope: "Own files, received shares, and personal transfers",
    icon: <Users size={18} />,
    tone: "border-gray-200 bg-gray-50 text-gray-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-300",
    badge: "default",
  },
];

const PERMISSIONS: Permission[] = [
  { key: "files_read", label: "Browse files", description: "View available files and folders within the role scope.", group: "workspace", grants: { superadmin: true, admin: true, user: true } },
  { key: "files_write", label: "Upload and organize files", description: "Upload files, create folders, rename, move, star, and restore own content.", group: "workspace", grants: { superadmin: true, admin: true, user: true } },
  { key: "files_delete_own", label: "Delete own files", description: "Move owned files to trash and permanently remove allowed personal content.", group: "workspace", grants: { superadmin: true, admin: true, user: true } },
  { key: "files_moderate", label: "Moderate team files", description: "Review, restore, and manage files owned by other users.", group: "workspace", grants: { superadmin: true, admin: true, user: false } },
  { key: "storage_manage", label: "Manage storage", description: "Review storage usage, upload sessions, and user quotas.", group: "workspace", grants: { superadmin: true, admin: true, user: false } },
  { key: "transfer_send", label: "Send transfers", description: "Create file transfers for link, email, QR, and private delivery.", group: "sharing", grants: { superadmin: true, admin: true, user: true } },
  { key: "share_links", label: "Create share links", description: "Create, renew, disable, and delete own share links.", group: "sharing", grants: { superadmin: true, admin: true, user: true } },
  { key: "sharing_admin", label: "Manage all platform links", description: "View and control shared links, QR shares, and email shares across users.", group: "sharing", grants: { superadmin: true, admin: false, user: false } },
  { key: "analytics", label: "View analytics and reports", description: "Open operational analytics, reports, and platform summaries.", group: "administration", grants: { superadmin: true, admin: true, user: false } },
  { key: "users_manage", label: "Manage users", description: "Create users, update profiles, activate/deactivate accounts, and set quotas.", group: "administration", grants: { superadmin: true, admin: true, user: false } },
  { key: "roles_view", label: "View role policy", description: "Review fixed role permissions and access boundaries.", group: "administration", grants: { superadmin: true, admin: true, user: false } },
  { key: "admin_assign", label: "Assign admin access", description: "Promote or manage admin-level accounts.", group: "administration", grants: { superadmin: true, admin: false, user: false } },
  { key: "audit_logs", label: "View audit logs", description: "Inspect audit events and high-risk workspace activity.", group: "system", grants: { superadmin: true, admin: false, user: false } },
  { key: "system_health", label: "View system health", description: "Monitor backend health, services, and runtime signals.", group: "system", grants: { superadmin: true, admin: false, user: false } },
  { key: "database", label: "View database status", description: "Inspect MongoDB collection size, indexes, and storage stats.", group: "system", grants: { superadmin: true, admin: false, user: false } },
];

const GROUP_LABEL: Record<PermissionGroup, string> = {
  workspace: "Workspace",
  sharing: "Sharing",
  administration: "Administration",
  system: "System",
};

type RoleCounts = Record<RoleKey, number>;

function normalizeCounts(raw: Record<string, unknown>): RoleCounts {
  const byRole = (raw.byRole ?? {}) as Record<string, unknown>;
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = Number(byRole[key] ?? raw[key]);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  };

  return {
    superadmin: get("superadmin", "SUPERADMIN", "totalSuperAdmins"),
    admin: get("admin", "ADMIN", "totalAdmins"),
    user: get("user", "USER", "totalUsers", "total"),
  };
}

function grantCount(role: RoleKey) {
  return PERMISSIONS.filter((permission) => permission.grants[role]).length;
}

export default function RolesPage() {
  const [selected, setSelected] = useState<RoleKey>("superadmin");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<RoleCounts>({ superadmin: 0, admin: 0, user: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await usersApi.adminStats();
      setCounts(normalizeCounts(res.data?.data ?? res.data ?? {}));
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const selectedRole = ROLES.find((role) => role.key === selected) ?? ROLES[0];
  const query = search.trim().toLowerCase();

  const visiblePermissions = useMemo(() => (
    PERMISSIONS.filter((permission) => {
      if (!query) return true;
      return `${permission.label} ${permission.description} ${GROUP_LABEL[permission.group]}`
        .toLowerCase()
        .includes(query);
    })
  ), [query]);

  const groupedPermissions = useMemo(() => (
    (Object.keys(GROUP_LABEL) as PermissionGroup[]).map((group) => ({
      group,
      permissions: visiblePermissions.filter((permission) => permission.group === group),
    })).filter((section) => section.permissions.length > 0)
  ), [visiblePermissions]);

  const totalUsers = counts.superadmin + counts.admin + counts.user;
  const selectedGranted = grantCount(selected);

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-6 pb-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-orange-600 dark:text-orange-400">
                <LockKeyhole size={14} />
                Access Policy
              </div>
              <h1 className="mt-2 flex items-center gap-2.5 text-3xl font-bold text-gray-950 dark:text-white">
                <UserCheck size={26} className="text-orange-500" />
                Role Manager
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                Review the fixed access model for users, admins, and superadmins across Jai Export Enterprises.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
              disabled={loading}
              onClick={() => load()}
            >
              Refresh counts
            </Button>
          </div>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total Accounts", value: totalUsers.toLocaleString(), icon: <Users size={16} />, tone: "text-zinc-700 dark:text-zinc-200" },
              { label: "Privileged", value: (counts.superadmin + counts.admin).toLocaleString(), icon: <ShieldCheck size={16} />, tone: "text-orange-600" },
              { label: "System Roles", value: ROLES.length.toString(), icon: <SlidersHorizontal size={16} />, tone: "text-blue-600" },
              { label: "Permissions", value: PERMISSIONS.length.toString(), icon: <CheckCircle2 size={16} />, tone: "text-emerald-600" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-gray-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{item.label}</p>
                    <p className={`mt-2 text-2xl font-bold ${item.tone}`}>{loading ? "..." : item.value}</p>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-300">
                    {item.icon}
                  </span>
                </div>
              </div>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            {ROLES.map((role) => {
              const active = selected === role.key;
              const users = counts[role.key];
              return (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => setSelected(role.key)}
                  className={`rounded-lg border p-5 text-left shadow-sm transition ${active ? role.tone : "border-gray-200/70 bg-white hover:border-gray-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-11 w-11 items-center justify-center rounded-lg border ${role.tone}`}>
                        {role.icon}
                      </span>
                      <div>
                        <h2 className="font-bold text-gray-950 dark:text-white">{role.label}</h2>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{role.scope}</p>
                      </div>
                    </div>
                    <Badge variant={role.badge}>System</Badge>
                  </div>
                  <p className="mt-4 text-sm leading-5 text-gray-600 dark:text-gray-300">{role.summary}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Accounts</p>
                      <p className="mt-1 font-bold text-gray-950 dark:text-white">{loading ? "..." : users.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Granted</p>
                      <p className="mt-1 font-bold text-gray-950 dark:text-white">{grantCount(role.key)} / {PERMISSIONS.length}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="rounded-lg border border-gray-200/70 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <span className={`flex h-12 w-12 items-center justify-center rounded-lg border ${selectedRole.tone}`}>
                  {selectedRole.icon}
                </span>
                <div>
                  <h2 className="font-bold text-gray-950 dark:text-white">{selectedRole.label}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{selectedRole.scope}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">{selectedRole.summary}</p>
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-zinc-800">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Users assigned</span>
                  <span className="font-bold text-gray-950 dark:text-white">{loading ? "..." : counts[selected].toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-zinc-800">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Permissions granted</span>
                  <span className="font-bold text-gray-950 dark:text-white">{selectedGranted} / {PERMISSIONS.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Policy mode</span>
                  <span className="font-bold text-gray-950 dark:text-white">Fixed</span>
                </div>
              </div>
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                Role permissions are controlled by backend guards and route policy. Edit user assignments from the Users page.
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200/70 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-bold text-gray-950 dark:text-white">Permission Matrix</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Search and compare role access across platform modules</p>
                </div>
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search permissions..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white sm:w-64"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-180 text-sm">
                  <thead className="bg-gray-50 dark:bg-zinc-950/30">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-bold uppercase text-gray-500">Permission</th>
                      {ROLES.map((role) => (
                        <th key={role.key} className="px-4 py-3 text-center text-xs font-bold uppercase text-gray-500">{role.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedPermissions.map((section) => (
                      <RowGroup key={section.group} section={section} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}

function RowGroup({
  section,
}: {
  section: { group: PermissionGroup; permissions: Permission[] };
}) {
  return (
    <>
      <tr className="border-y border-gray-100 bg-gray-50/70 dark:border-zinc-800 dark:bg-zinc-950/30">
        <td colSpan={4} className="px-5 py-2 text-[11px] font-bold uppercase text-gray-500 dark:text-gray-400">
          {GROUP_LABEL[section.group]}
        </td>
      </tr>
      {section.permissions.map((permission) => (
        <tr key={permission.key} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 dark:border-zinc-800/70 dark:hover:bg-zinc-800/30">
          <td className="px-5 py-4">
            <p className="font-semibold text-gray-950 dark:text-white">{permission.label}</p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-gray-500 dark:text-gray-400">{permission.description}</p>
          </td>
          {ROLES.map((role) => {
            const allowed = permission.grants[role.key];
            return (
              <td key={role.key} className="px-4 py-4 text-center">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${allowed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-gray-500"}`}>
                  {allowed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                </span>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
