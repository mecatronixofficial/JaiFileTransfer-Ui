"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Users, Search, Plus, Eye, Trash2, Shield, Crown, CheckCircle2,
  UserCheck, HardDrive, RefreshCw, X, Ban, Power, PowerOff, Save,
  Pencil, ChevronDown, ChevronLeft, ChevronRight as ChevronRightIcon,
  AlertTriangle, Mail, Phone, Building2, Calendar, DatabaseZap,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Avatar, Modal } from "@/components/ui";
import { usersApi } from "@/lib/api";
import { User } from "@/types";
import { formatBytes, formatDate, formatRelative } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { handleApiError } from "@/lib/error-handler";
import { showToast } from "@/lib/toast";

/* ─── Role config ─── */
const ROLE_CONFIG: Record<User["role"], { label: string; badge: string; icon: React.ReactNode }> = {
  user:       { label: "User",        icon: <UserCheck size={10} />, badge: "bg-gray-100 text-gray-600 ring-gray-200/50 dark:bg-zinc-800 dark:text-gray-400 dark:ring-zinc-700" },
  admin:      { label: "Admin",       icon: <Crown size={10} />,    badge: "bg-orange-50 text-orange-600 ring-orange-200/50 dark:bg-orange-950/20 dark:text-orange-400 dark:ring-orange-800/30" },
  superadmin: { label: "Super Admin", icon: <Shield size={10} />,   badge: "bg-red-50 text-red-600 ring-red-200/50 dark:bg-red-950/20 dark:text-red-400 dark:ring-red-800/30" },
};

interface EditForm {
  name: string;
  email: string;
  department: string;
  phone: string;
  role: User["role"];
}

interface AdminUserStats {
  total: number;
  active: number;
  inactive: number;
  byRole: Partial<Record<User["role"], number>>;
  storage?: {
    totalUsedBytes?: number;
    totalQuotaBytes?: number;
  };
}

type ApiUser = Partial<User> & {
  _id?: string;
  is_active?: boolean;
  is_email_verified?: boolean;
  storage_used?: number;
  storage_quota?: number;
  storage?: { usedBytes?: number; quotaBytes?: number; fileCount?: number };
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

const normalizeUser = (u: ApiUser): User => {
  const storage = u.storage;

  return {
    id: String(u.id ?? u._id ?? ""),
    name: u.name ?? "",
    email: u.email ?? "",
    role: u.role ?? "user",
    isActive: u.isActive ?? u.is_active ?? true,
    isEmailVerified: u.isEmailVerified ?? u.is_email_verified ?? false,
    storageUsed: storage?.usedBytes ?? u.storageUsed ?? u.storage_used ?? 0,
    storageQuota: storage?.quotaBytes ?? u.storageQuota ?? u.storage_quota ?? 0,
    department: u.department ?? null,
    phone: u.phone ?? null,
    lastLoginAt: u.lastLoginAt ?? u.last_login_at ?? null,
    createdAt: u.createdAt ?? u.created_at ?? new Date().toISOString(),
    updatedAt: u.updatedAt ?? u.updated_at ?? new Date().toISOString(),
    avatar: u.avatar,
  };
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseUsers(data: any): User[] {
  const arr: ApiUser[] =
    Array.isArray(data?.users)         ? data.users           :
    Array.isArray(data?.data?.users)   ? data.data.users      :
    Array.isArray(data?.data?.items)   ? data.data.items      :
    Array.isArray(data?.data?.docs)    ? data.data.docs       :
    Array.isArray(data?.data?.results) ? data.data.results    :
    Array.isArray(data?.items)         ? data.items           :
    Array.isArray(data?.docs)          ? data.docs            :
    Array.isArray(data?.results)       ? data.results         :
    Array.isArray(data?.data)          ? data.data            :
    Array.isArray(data)                ? data                 : [];
  return arr.map(normalizeUser).filter((u) => u.id);
}

function parseTotal(data: any): number {
  return (
    data?.pagination?.total ??
    data?.data?.pagination?.total ??
    data?.total         ??
    data?.data?.total   ??
    data?.meta?.total   ??
    data?.data?.meta?.total ??
    data?.count         ??
    data?.data?.count   ??
    0
  );
}

function parseAdminStats(data: any): AdminUserStats | null {
  const raw = data?.data ?? data;
  if (!raw || typeof raw !== "object") return null;
  return {
    total: Number(raw.total) || 0,
    active: Number(raw.active) || 0,
    inactive: Number(raw.inactive) || 0,
    byRole: raw.byRole ?? {},
    storage: raw.storage,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ─── User detail drawer ─── */
interface DrawerProps {
  user: User;
  isSuperAdmin: boolean;
  isCurrentUser: boolean;
  onClose: () => void;
  onSaveEdit: (id: string, data: Partial<EditForm>) => Promise<void>;
  onToggleActive: (user: User) => Promise<void>;
  onDelete: (id: string, name: string) => void;
  onOpenQuota: (user: User) => void;
  onSyncStorage: (user: User) => Promise<void>;
  syncingUser: string | null;
}

function UserDrawer({
  user, isSuperAdmin, isCurrentUser, onClose,
  onSaveEdit, onToggleActive, onDelete, onOpenQuota, onSyncStorage, syncingUser,
}: DrawerProps) {
  const rc = ROLE_CONFIG[user.role];
  const storagePct = user.storageQuota > 0
    ? Math.min((user.storageUsed / user.storageQuota) * 100, 100) : 0;

  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [toggling, setToggling] = useState(false);

  const [form, setForm] = useState<EditForm>({
    name: user.name, email: user.email,
    department: user.department ?? "", phone: user.phone ?? "",
    role: user.role,
  });

  const field = (key: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSave() {
    setSaving(true);
    try { await onSaveEdit(user.id, form); setEditing(false); }
    finally { setSaving(false); }
  }

  async function handleToggle() {
    setToggling(true);
    try { await onToggleActive(user); } finally { setToggling(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 id="drawer-title" className="font-bold text-gray-900 dark:text-white">
            {editing ? "Edit user" : "User details"}
          </h3>
          <div className="flex items-center gap-2">
            {!editing && (
              <button type="button" onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:border-zinc-700 dark:text-gray-400 dark:hover:border-orange-700 dark:hover:bg-orange-950/20 dark:hover:text-orange-400">
                <Pencil size={12} /> Edit
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-6">

          {/* Identity */}
          <div className="flex items-center gap-4">
            <Avatar name={user.name} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.name}</p>
                {user.isEmailVerified && (
                  <span title="Email verified">
                    <CheckCircle2 size={14} className="shrink-0 text-blue-500" />
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${rc.badge}`}>
                  {rc.icon} {rc.label}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${user.isActive ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? "bg-green-500" : "bg-gray-400"}`} />
                  {user.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>

          {/* Edit form */}
          {editing ? (
            <div className="space-y-4 rounded-2xl border border-orange-200/60 bg-orange-50/30 p-4 dark:border-orange-800/20 dark:bg-orange-950/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">Editing details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Input label="Full name" value={form.name} onChange={field("name")} placeholder="Full name" />
                </div>
                <div className="col-span-2">
                  <Input label="Email" type="email" value={form.email} onChange={field("email")} placeholder="email@example.com" />
                </div>
                <Input label="Department" value={form.department} onChange={field("department")} placeholder="e.g. Sales" />
                <Input label="Phone" value={form.phone} onChange={field("phone")} placeholder="+91 00000 00000" />
                <div className="col-span-2 space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                  <div className="relative">
                    <select value={form.role} onChange={field("role")} aria-label="User role"
                      className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-2.5 pl-4 pr-9 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      {isSuperAdmin && <option value="superadmin">Super Admin</option>}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 pt-1">
                <Button variant="secondary" fullWidth type="button" onClick={() => setEditing(false)}>Cancel</Button>
                <Button fullWidth leftIcon={<Save size={14} />} loading={saving} onClick={handleSave}>Save changes</Button>
              </div>
            </div>
          ) : (
            <>
              {/* Storage */}
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-zinc-800/50">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Storage usage</span>
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    {formatBytes(user.storageUsed)} / {formatBytes(user.storageQuota)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                  <div
                    className={`h-full origin-left rounded-full transition-transform duration-500 ${storagePct >= 90 ? "bg-red-500" : storagePct >= 75 ? "bg-amber-500" : "bg-orange-500"}`}
                    style={{ transform: `scaleX(${(storagePct / 100).toFixed(4)})` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">{storagePct.toFixed(0)}% used</p>
              </div>

              {/* Meta */}
              <div className="divide-y divide-gray-100 dark:divide-zinc-800 rounded-xl border border-gray-100 dark:border-zinc-800">
                {[
                  { label: "Joined",      val: formatDate(user.createdAt),        icon: <Calendar size={12} /> },
                  { label: "Last active", val: formatRelative(user.lastLoginAt),   icon: <Eye size={12} /> },
                  { label: "Department",  val: user.department || "—",             icon: <Building2 size={12} /> },
                  { label: "Phone",       val: user.phone || "—",                  icon: <Phone size={12} /> },
                  { label: "Email",       val: user.email,                          icon: <Mail size={12} /> },
                  { label: "User ID",     val: `#${user.id.slice(0, 12)}…`,        icon: <Shield size={12} /> },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      {r.icon} {r.label}
                    </div>
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200 max-w-50 truncate text-right">{r.val}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-1">
                <Button fullWidth variant="secondary" leftIcon={<HardDrive size={13} />} onClick={() => onOpenQuota(user)}>
                  Update storage quota
                </Button>
                <Button
                  fullWidth
                  variant="secondary"
                  leftIcon={<RefreshCw size={13} className={syncingUser === user.id ? "animate-spin" : ""} />}
                  loading={syncingUser === user.id}
                  onClick={() => onSyncStorage(user)}
                >
                  Sync storage usage
                </Button>
                {!isCurrentUser && (
                  <>
                    <Button fullWidth variant="secondary"
                      leftIcon={user.isActive ? <PowerOff size={13} /> : <Power size={13} />}
                      loading={toggling} onClick={handleToggle}
                      className={user.isActive
                        ? "hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/20"
                        : "hover:border-green-200 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-950/20"
                      }>
                      {user.isActive ? "Deactivate account" : "Activate account"}
                    </Button>
                    {isSuperAdmin && (
                      <Button fullWidth variant="danger" leftIcon={<Trash2 size={13} />} onClick={() => onDelete(user.id, user.name)}>
                        Delete account
                      </Button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   PAGE
════════════════════════════════════════ */
const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const router = useRouter();

  const role = me?.role?.toLowerCase();
  const isSuperAdmin = role === "superadmin";
  const isAdmin      = role === "admin" || isSuperAdmin;

  const [allUsers,    setAllUsers]    = useState<User[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState<string | null>(null);
  const [adminStats,  setAdminStats]  = useState<AdminUserStats | null>(null);
  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState<"all" | User["role"]>("all");
  const [statusFilter,setStatusFilter]= useState<"all" | "active" | "inactive">("all");
  const [page,        setPage]        = useState(1);
  const [selected,    setSelected]    = useState<User | null>(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [showQuota,   setShowQuota]   = useState(false);
  const [quotaUser,   setQuotaUser]   = useState<User | null>(null);
  const [quotaGB,     setQuotaGB]     = useState("10");
  const [creating,    setCreating]    = useState(false);
  const [deleteTarget,setDeleteTarget]= useState<{ id: string; name: string } | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [syncingUser, setSyncingUser] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" });

  useEffect(() => {
    if (me && !isAdmin) router.push("/dashboard");
  }, [me, isAdmin, router]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setFetchError(null);
    try {
      const LIMIT = 100;
      const [firstResult, statsResult] = await Promise.allSettled([
        usersApi.list({ page: 1, limit: LIMIT }),
        usersApi.adminStats(),
      ]);

      if (statsResult.status === "fulfilled") {
        setAdminStats(parseAdminStats(statsResult.value.data));
      }

      if (firstResult.status === "rejected") throw firstResult.reason;

      const first = firstResult.value;
      const firstPage = parseUsers(first.data);
      const total     = parseTotal(first.data);

      if (total > LIMIT && firstPage.length === LIMIT) {
        const pageCount = Math.ceil(total / LIMIT);
        const rest = await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, i) =>
            usersApi.list({ page: i + 2, limit: LIMIT }).then((r) => parseUsers(r.data)),
          ),
        );
        setAllUsers([...firstPage, ...rest.flat()]);
      } else {
        setAllUsers(firstPage);
      }
    } catch (err) {
      const msg = handleApiError(err);
      setFetchError(msg);
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

  /* ─── Create ─── */
  async function createUser(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return showToast.error("All fields are required");
    setCreating(true);
    try {
      await usersApi.create(form);
      showToast.success("User created successfully");
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "user" });
      load(true);
    } catch (err) { handleApiError(err); }
    finally { setCreating(false); }
  }

  /* ─── Edit ─── */
  async function saveEdit(id: string, data: Partial<EditForm>) {
    try {
      const payload: Record<string, unknown> = {};
      if (data.name?.trim())       payload.name       = data.name.trim();
      if (data.email?.trim())      payload.email      = data.email.trim();
      if (data.role)               payload.role       = data.role;
      if (data.department?.trim()) payload.department = data.department.trim();
      if (data.phone?.trim())      payload.phone      = data.phone.trim();
      const res = await usersApi.updateById(id, payload);
      const updated = normalizeUser(res.data?.data ?? res.data);
      setAllUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)));
      setSelected((p) => (p?.id === id ? { ...p, ...updated } : p));
      showToast.success("User updated");
    } catch (err) { handleApiError(err); throw err; }
  }

  /* ─── Activate / Deactivate ─── */
  async function toggleActive(user: User) {
    try {
      if (user.isActive) await usersApi.deactivate(user.id);
      else               await usersApi.activate(user.id);
      const next = { ...user, isActive: !user.isActive };
      setAllUsers((prev) => prev.map((u) => (u.id === user.id ? next : u)));
      setSelected((p) => (p?.id === user.id ? next : p));
      showToast.success(`User ${user.isActive ? "deactivated" : "activated"}`);
    } catch (err) { handleApiError(err); throw err; }
  }

  /* ─── Delete ─── */
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await usersApi.delete(deleteTarget.id);
      showToast.success("User deleted");
      setDeleteTarget(null);
      setSelected(null);
      setAllUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
    } catch (err) { handleApiError(err); }
    finally { setDeleting(false); }
  }

  /* ─── Quota ─── */
  async function updateQuota(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!quotaUser) return;
    const bytes = parseFloat(quotaGB) * 1_073_741_824;
    if (isNaN(bytes) || bytes <= 0) return showToast.error("Enter a valid quota in GB");
    setCreating(true);
    try {
      await usersApi.updateQuota(quotaUser.id, bytes);
      showToast.success("Quota updated");
      setShowQuota(false);
      setAllUsers((prev) => prev.map((u) => (u.id === quotaUser.id ? { ...u, storageQuota: bytes } : u)));
      setSelected((prev) => prev?.id === quotaUser.id ? { ...prev, storageQuota: bytes } : prev);
      load(true);
    } catch (err) { handleApiError(err); }
    finally { setCreating(false); }
  }

  async function syncStorage(user: User) {
    setSyncingUser(user.id);
    try {
      const res = await usersApi.syncStorage(user.id);
      const storageUsed = Number(res.data?.data?.storageUsed ?? user.storageUsed);
      setAllUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, storageUsed } : u)));
      setSelected((prev) => prev?.id === user.id ? { ...prev, storageUsed } : prev);
      showToast.success("Storage synced");
      load(true);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSyncingUser(null);
    }
  }

  /* ─── Filtered + paginated ─── */
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allUsers.filter((u) => {
      const ms = !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
      const rs = roleFilter === "all" || u.role === roleFilter;
      const ss = statusFilter === "all" || (statusFilter === "active" ? u.isActive : !u.isActive);
      return ms && rs && ss;
    });
  }, [allUsers, roleFilter, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageUsers  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    const id = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(id);
  }, [search, roleFilter, statusFilter]);

  /* ─── Stats ─── */
  const derivedStats = useMemo(() => {
    const totalUsed = allUsers.reduce((sum, user) => sum + (user.storageUsed || 0), 0);
    const totalQuota = allUsers.reduce((sum, user) => sum + (user.storageQuota || 0), 0);
    const highUsage = allUsers.filter((user) => user.storageQuota > 0 && user.storageUsed / user.storageQuota >= 0.8).length;
    return { totalUsed, totalQuota, highUsage };
  }, [allUsers]);

  const stats = [
    { label: "Total",    val: adminStats?.total ?? allUsers.length, icon: <Users size={13} />, ic: "text-gray-500", color: "bg-gray-50 dark:bg-zinc-800/50" },
    { label: "Active",   val: adminStats?.active ?? allUsers.filter((u) => u.isActive).length, icon: <CheckCircle2 size={13} />, ic: "text-green-500", color: "bg-green-50 dark:bg-green-950/20" },
    { label: "Admins",   val: (adminStats?.byRole.admin ?? 0) + (adminStats?.byRole.superadmin ?? 0) || allUsers.filter((u) => u.role !== "user").length, icon: <Crown size={13} />, ic: "text-orange-500", color: "bg-orange-50 dark:bg-orange-950/20" },
    { label: "Inactive", val: adminStats?.inactive ?? allUsers.filter((u) => !u.isActive).length, icon: <Ban size={13} />, ic: "text-red-500", color: "bg-red-50 dark:bg-red-950/20" },
  ];

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-6 py-2">

          {/* ── Header ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-950/20 ring-1 ring-orange-200 dark:ring-orange-800/30">
                <Users size={18} className="text-orange-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Manager</h1>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {loading ? "Loading…" : `${allUsers.length} total · ${allUsers.filter((u) => u.isActive).length} active`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={13} />} onClick={() => load()}>Refresh</Button>
              <Button leftIcon={<Plus size={15} />} onClick={() => setShowCreate(true)}>New User</Button>
            </div>
          </div>

          {/* ── Error banner ── */}
          {fetchError && !loading && allUsers.length === 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/30 dark:bg-red-950/20">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Failed to load users</p>
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-500">{fetchError}</p>
              </div>
              <button type="button" onClick={() => load()}
                className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-800/30 dark:text-red-400 dark:hover:bg-red-950/40">
                Retry
              </button>
            </div>
          )}

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className={`rounded-2xl border border-gray-200/80 p-4 dark:border-zinc-800 ${s.color}`}>
                <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${s.ic}`}>
                  {s.icon} {s.label}
                </div>
                {loading
                  ? <div className="h-7 w-12 animate-pulse rounded-lg bg-gray-200 dark:bg-zinc-700" />
                  : <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.val}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                <HardDrive size={15} className="text-blue-500" />
                Storage Used
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {formatBytes(adminStats?.storage?.totalUsedBytes ?? derivedStats.totalUsed)} of {formatBytes(adminStats?.storage?.totalQuotaBytes ?? derivedStats.totalQuota)}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                <AlertTriangle size={15} className="text-amber-500" />
                High Usage
              </div>
              <p className="mt-2 text-xs text-gray-500">{derivedStats.highUsage} users at or above 80% quota</p>
            </div>
            <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                <DatabaseZap size={15} className="text-emerald-500" />
                Sync Tools
              </div>
              <p className="mt-2 text-xs text-gray-500">Recalculate storage from active file records per user</p>
            </div>
          </div>

          {/* ── Filters ── */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "user", "admin", "superadmin"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRoleFilter(r)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                    roleFilter === r
                      ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/20 dark:text-orange-400"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                  }`}>
                  {r === "superadmin" ? "Superadmin" : r}
                </button>
              ))}
              <button type="button" onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  statusFilter === "active"
                    ? "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/20 dark:text-green-400"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400"
                }`}>
                Active only
              </button>
            </div>
          </div>

          {/* ── Table ── */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/50">
                    {["User", "Role", "Status", "Last Active", "Storage", "Quota", "Actions"].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/50">
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          {[160, 80, 70, 90, 80, 70, 60].map((_, j) => (
                            <td key={j} className="px-4 py-3">
                              <div className="h-4 w-20 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : pageUsers.map((user) => {
                        const rc  = ROLE_CONFIG[user.role];
                        const pct = user.storageQuota > 0
                          ? Math.min((user.storageUsed / user.storageQuota) * 100, 100) : 0;
                        return (
                          <tr key={user.id} className="group transition-colors hover:bg-gray-50/50 dark:hover:bg-zinc-800/20">
                            <td className="px-4 py-3">
                              <button type="button" onClick={() => setSelected(user)} className="flex items-center gap-3 text-left">
                                <Avatar name={user.name} size={36} />
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-medium text-gray-900 hover:text-orange-500 dark:text-white">{user.name}</p>
                                    {user.isEmailVerified && <CheckCircle2 size={11} className="shrink-0 text-blue-400" />}
                                  </div>
                                  <p className="text-xs text-gray-400">{user.email}</p>
                                </div>
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${rc.badge}`}>
                                {rc.icon} {rc.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                user.isActive
                                  ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                                  : "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400"
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? "bg-green-500" : "bg-gray-400"}`} />
                                {user.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                              {formatRelative(user.lastLoginAt)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="w-24">
                                <div className="mb-1 flex items-center justify-between">
                                  <span className="text-[10px] text-gray-400">{pct.toFixed(0)}%</span>
                                  <span className="text-[10px] text-gray-400">{formatBytes(user.storageUsed)}</span>
                                </div>
                                <div className="h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                                  <div
                                    className={`h-full origin-left rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-orange-500"}`}
                                    style={{ transform: `scaleX(${(pct / 100).toFixed(4)})` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                              {formatBytes(user.storageQuota)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <button type="button" onClick={() => setSelected(user)} title="View details"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800">
                                  <Eye size={13} />
                                </button>
                                <button type="button" onClick={() => setSelected(user)} title="Edit user"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-orange-50 hover:text-orange-500 dark:hover:bg-orange-950/20">
                                  <Pencil size={13} />
                                </button>
                                <button type="button"
                                  onClick={() => { setQuotaUser(user); setQuotaGB(String(Math.round((user.storageQuota || 10_737_418_240) / 1_073_741_824))); setShowQuota(true); }}
                                  title="Update quota"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800">
                                  <HardDrive size={13} />
                                </button>
                                <button type="button" onClick={() => syncStorage(user)} disabled={syncingUser === user.id}
                                  title="Sync storage"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-500 disabled:opacity-60 dark:hover:bg-blue-950/20">
                                  <RefreshCw size={13} className={syncingUser === user.id ? "animate-spin" : ""} />
                                </button>
                                {user.id !== me?.id && (
                                  <button type="button" onClick={() => toggleActive(user)}
                                    title={user.isActive ? "Deactivate" : "Activate"}
                                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                                      user.isActive
                                        ? "text-gray-400 hover:bg-amber-50 hover:text-amber-500 dark:hover:bg-amber-950/20"
                                        : "text-gray-400 hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/20"
                                    }`}>
                                    {user.isActive ? <PowerOff size={13} /> : <Power size={13} />}
                                  </button>
                                )}
                                {isSuperAdmin && user.id !== me?.id && (
                                  <button type="button" onClick={() => setDeleteTarget({ id: user.id, name: user.name })}
                                    title="Delete user"
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20">
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>

              {!loading && pageUsers.length === 0 && (
                <div className="py-12 text-center text-gray-400">
                  <Users size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{search ? "No users match your search" : "No users yet"}</p>
                </div>
              )}
            </div>

            {/* ── Pagination ── */}
            {!loading && filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3.5 dark:border-zinc-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-label="Previous page" disabled={safePage === 1} onClick={() => setPage((p) => p - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500 disabled:opacity-40 dark:border-zinc-700 dark:hover:border-orange-700 dark:hover:bg-orange-950/20 dark:hover:text-orange-400">
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
                    const p = start + i;
                    return (
                      <button key={p} type="button" onClick={() => setPage(p)}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-medium transition ${
                          p === safePage
                            ? "bg-orange-500 text-white"
                            : "border border-gray-200 text-gray-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500 dark:border-zinc-700 dark:text-gray-400"
                        }`}>
                        {p}
                      </button>
                    );
                  })}
                  <button type="button" aria-label="Next page" disabled={safePage === totalPages} onClick={() => setPage((p) => p + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500 disabled:opacity-40 dark:border-zinc-700 dark:hover:border-orange-700 dark:hover:bg-orange-950/20 dark:hover:text-orange-400">
                    <ChevronRightIcon size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── User drawer ── */}
        {selected && (
          <UserDrawer
            key={selected.id}
            user={selected}
            isSuperAdmin={isSuperAdmin}
            isCurrentUser={selected.id === me?.id}
            onClose={() => setSelected(null)}
            onSaveEdit={saveEdit}
            onToggleActive={toggleActive}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
            onOpenQuota={(u) => { setQuotaUser(u); setQuotaGB(String(Math.round((u.storageQuota || 10_737_418_240) / 1_073_741_824))); setShowQuota(true); }}
            onSyncStorage={syncStorage}
            syncingUser={syncingUser}
          />
        )}

        {/* ── Create user modal ── */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New User">
          <form onSubmit={createUser} className="space-y-4">
            <Input label="Full Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" required />
            <Input label="Password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" required />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
              <div className="relative">
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} aria-label="User role"
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-4 pr-9 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  {isSuperAdmin && <option value="superadmin">Super Admin</option>}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <Button variant="secondary" fullWidth type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button fullWidth type="submit" loading={creating} leftIcon={<Plus size={15} />}>Create User</Button>
            </div>
          </form>
        </Modal>

        {/* ── Quota modal ── */}
        <Modal open={showQuota} onClose={() => setShowQuota(false)} title="Update Storage Quota">
          <form onSubmit={updateQuota} className="space-y-4">
            {quotaUser && (
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-zinc-800/50">
                <Avatar name={quotaUser.name} size={32} />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{quotaUser.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatBytes(quotaUser.storageUsed)} used · current quota {formatBytes(quotaUser.storageQuota)}
                  </p>
                </div>
              </div>
            )}
            <Input
              label="New Quota (GB)"
              type="number"
              value={quotaGB}
              onChange={(e) => setQuotaGB(e.target.value)}
              min="1" max="10240" step="1"
              helperText="1 GB = 1,073,741,824 bytes"
            />
            <div className="flex flex-col gap-3 pt-2">
              <Button variant="secondary" fullWidth type="button" onClick={() => setShowQuota(false)}>Cancel</Button>
              <Button fullWidth type="submit" loading={creating} leftIcon={<HardDrive size={15} />}>Update Quota</Button>
            </div>
          </form>
        </Modal>

        {/* ── Delete confirmation modal ── */}
        <Modal
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          title="Delete User Account"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800/30 dark:bg-red-950/20">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">This action is permanent</p>
                <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                  Deleting <span className="font-bold">{deleteTarget?.name}</span> will permanently remove their account,
                  all files, and associated data. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" fullWidth loading={deleting} leftIcon={<Trash2 size={14} />} onClick={confirmDelete}>
                Delete permanently
              </Button>
            </div>
          </div>
        </Modal>

      </DashboardLayout>
    </AuthGuard>
  );
}
