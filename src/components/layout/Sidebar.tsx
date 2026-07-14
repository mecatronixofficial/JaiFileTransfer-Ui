"use client";

import {
  useState,
  useEffect,
  memo,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  ArrowLeftRight,
  ArrowUpRight,
  ArrowDownLeft,
  HardDrive,
  FolderTree,
  Files,
  Star,
  Share2,
  Trash2,
  Link2,
  QrCode,
  Mail,
  Layers,
  FileText,
  Image as ImageIcon,
  Video,
  FileSpreadsheet,
  Bell,
  Activity,
  PieChart,
  Crown,
  Users,
  ShieldCheck,
  Shield,
  Database,
  Globe,
  ScrollText,
  Settings,
  HelpCircle,
  Upload,
  LogOut,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronRight,
  Plus,
  UserCheck,
  Gauge,
  PackageCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar } from "@/components/ui";
import { formatBytes } from "@/lib/utils";
import Button from "../ui/Button";
import ImgHelper from "@/helper/img_helper";

/* ─── Types ─── */
type Role = "USER" | "ADMIN" | "SUPERADMIN";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: string | number;
  minRole?: Role;
  maxRole?: Role;
}

interface SectionDef {
  key: string;
  label: string;
  icon: ReactNode;
  items: NavItem[];
  minRole?: Role;
  accent?: "orange" | "red";
  openByDefault?: boolean;
}

/* ─── Role helpers ─── */
const ROLE_RANK: Record<Role, number> = { USER: 0, ADMIN: 1, SUPERADMIN: 2 };
const hasRole = (user: Role, min: Role) => ROLE_RANK[user] >= ROLE_RANK[min];
const isWithinMaxRole = (user: Role, max: Role) => ROLE_RANK[user] <= ROLE_RANK[max];
const canSeeNavItem = (role: Role, item: NavItem) =>
  (!item.minRole || hasRole(role, item.minRole)) &&
  (!item.maxRole || isWithinMaxRole(role, item.maxRole));
const normalizeRole = (role?: string): Role => {
  const r = (role ?? "user").toUpperCase();
  if (r === "SUPERADMIN") return "SUPERADMIN";
  if (r === "ADMIN") return "ADMIN";
  return "USER";
};

/* ─── Nav config ─── */
const DASHBOARD_ITEM: NavItem = {
  href: "/dashboard",
  label: "Dashboard",
  icon: <LayoutDashboard size={16} />,
};

const SECTIONS: SectionDef[] = [
  {
    key: "transfers",
    label: "Transfers",
    icon: <ArrowLeftRight size={15} />,
    openByDefault: true,
    items: [
      { href: "/transfers/send", label: "New Transfer", icon: <Plus size={15} /> },
      { href: "/transfers", label: "Sent Items", icon: <ArrowUpRight size={15} /> },
      { href: "/transfers/receive", label: "Received Items", icon: <ArrowDownLeft size={15} /> },
    ],
  },
  {
    key: "storage",
    label: "Storage",
    icon: <HardDrive size={15} />,
    openByDefault: true,
    items: [
      { href: "/files", label: "Files", icon: <Files size={15} /> },
      { href: "/folders", label: "Folders", icon: <FolderTree size={15} /> },
      { href: "/starred", label: "Starred", icon: <Star size={15} /> },
      { href: "/shared", label: "Shared With Me", icon: <Share2 size={15} /> },
      { href: "/trash", label: "Trash", icon: <Trash2 size={15} /> },
    ],
  },
  {
    key: "sharing",
    label: "Sharing",
    icon: <Link2 size={15} />,
    openByDefault: false,
    items: [
      { href: "/links", label: "Shared Links", icon: <Link2 size={15} /> },
      { href: "/links?type=qr", label: "QR Shares", icon: <QrCode size={15} /> },
      { href: "/links?type=email", label: "Email Shares", icon: <Mail size={15} /> },
    ],
  },
  {
    key: "categories",
    label: "Categories",
    icon: <Layers size={15} />,
    openByDefault: false,
    items: [
      { href: "/files?type=document", label: "Documents", icon: <FileText size={15} /> },
      { href: "/files?type=image", label: "Images", icon: <ImageIcon size={15} /> },
      { href: "/files?type=video", label: "Videos", icon: <Video size={15} /> },
      { href: "/files?type=spreadsheet", label: "Spreadsheets", icon: <FileSpreadsheet size={15} /> },
    ],
  },
  {
    key: "activity",
    label: "Activity",
    icon: <Activity size={15} />,
    openByDefault: false,
    items: [
      { href: "/notifications", label: "Notifications", icon: <Bell size={15} /> },
      { href: "/transactions", label: "Transactions", icon: <ScrollText size={15} /> },
    ],
  },
  {
    key: "administration",
    label: "Administration",
    icon: <Crown size={15} />,
    minRole: "ADMIN",
    accent: "orange",
    openByDefault: false,
    items: [
      { href: "/admin", label: "Admin Overview", icon: <Gauge size={15} /> },
      { href: "/admin/users", label: "Users", icon: <Users size={15} /> },
      { href: "/admin/roles", label: "Roles", icon: <ShieldCheck size={15} />, maxRole: "ADMIN" },
      { href: "/admin/files", label: "Files Manager", icon: <Files size={15} /> },
      { href: "/admin/links", label: "Links Manager", icon: <Link2 size={15} />, minRole: "SUPERADMIN" },
      { href: "/admin/storage", label: "Storage Manager", icon: <HardDrive size={15} /> },
      { href: "/admin/transfers", label: "Transfer Manager", icon: <ArrowLeftRight size={15} /> },
      { href: "/admin/activity", label: "Activity Log", icon: <Activity size={15} />, maxRole: "ADMIN" },
      { href: "/admin/analytics", label: "Analytics", icon: <PieChart size={15} />, maxRole: "ADMIN" },
    ],
  },
  {
    key: "system",
    label: "System",
    icon: <Shield size={15} />,
    minRole: "SUPERADMIN",
    accent: "red",
    openByDefault: false,
    items: [
      { href: "/superadmin/analytics", label: "Analytics", icon: <PieChart size={15} /> },
      { href: "/superadmin/roles", label: "Roles", icon: <ShieldCheck size={15} /> },
      { href: "/superadmin/system", label: "System Health", icon: <Activity size={15} /> },
      { href: "/superadmin/database", label: "Database", icon: <Database size={15} /> },
      { href: "/superadmin/domains", label: "Domains", icon: <Globe size={15} /> },
      { href: "/superadmin/audit-logs", label: "Audit Logs", icon: <ScrollText size={15} /> },
    ],
  },
];

const PREFERENCES: NavItem[] = [
  { href: "/settings", label: "Settings", icon: <Settings size={15} /> },
  { href: "/help", label: "Help & Support", icon: <HelpCircle size={15} /> },
];

const COLLAPSED_KEY = "sidebar:collapsed";
const SECTIONS_KEY = "sidebar:sections-v2";
const QUERY_SCOPED_BASES: Record<string, string[]> = {
  "/files": ["type"],
  "/links": ["type"],
};

function isHrefActive(
  href: string,
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  const [base, query] = href.split("?");
  if (href === "/dashboard" || href === "/admin") return pathname === base;
  if (base === "/transfers" && !query) return pathname === "/transfers";
  if (query) {
    if (pathname !== base) return false;
    const params = new URLSearchParams(query);
    for (const [k, v] of params.entries()) {
      if (searchParams.get(k) !== v) return false;
    }
    return true;
  }
  if (pathname === base && QUERY_SCOPED_BASES[base]?.some((key) => searchParams.has(key))) {
    return false;
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}

function getActiveSectionKey(
  pathname: string,
  searchParams: URLSearchParams,
): string | null {
  return SECTIONS.find((section) =>
    section.items.some((item) => isHrefActive(item.href, pathname, searchParams)),
  )?.key ?? null;
}

/* ════════════════ SUB-COMPONENTS ════════════════ */

function StorageBar({ pct, gradient }: { pct: number; gradient: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800/80">
      <div
        style={{ "--pct": pct / 100 } as React.CSSProperties}
        className={`h-full origin-left rounded-full bg-linear-to-r ${gradient} transform-[scaleX(var(--pct))] transition-[transform] duration-700 ease-out`}
      />
    </div>
  );
}

function WorkspaceSnapshot({
  usedPct,
  storageUsed,
  storageAvailable,
  storageLoading,
  storageLabel,
  storageTitle,
  hasStorageQuota,
  roleLabel,
  moduleCount,
}: {
  usedPct: number;
  storageUsed: number;
  storageAvailable: number;
  storageLoading: boolean;
  storageLabel: string;
  storageTitle: string;
  hasStorageQuota: boolean;
  roleLabel: string;
  moduleCount: number;
}) {
  return (
    <div className="mx-3 mb-2 rounded-xl border border-gray-200/70 bg-gray-50/70 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Gauge size={12} className="shrink-0 text-orange-400" />
          <span className="truncate text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            Workspace
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9.5px] font-bold text-gray-500 ring-1 ring-gray-200 dark:bg-zinc-800 dark:text-gray-400 dark:ring-zinc-700">
          {roleLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10.5px]">
        <div>
          <p className="text-gray-400 dark:text-gray-500">Storage</p>
          {storageLoading ? (
            <div className="mt-1 h-3 w-12 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
          ) : (
            <p
              className="mt-0.5 truncate font-semibold text-gray-700 dark:text-gray-200"
              title={storageTitle}
            >
              {storageLabel}
            </p>
          )}
        </div>
        <div>
          <p className="text-gray-400 dark:text-gray-500">Modules</p>
          <p className="mt-0.5 font-semibold text-gray-700 dark:text-gray-200">
            {moduleCount}
          </p>
        </div>
      </div>
      {!storageLoading && (
        <p className="mt-2 truncate text-[10px] text-gray-400 dark:text-gray-500">
          {hasStorageQuota
            ? `${usedPct.toFixed(0)}% used · ${formatBytes(storageAvailable)} free`
            : `${formatBytes(storageUsed)} used on Cloudflare R2`}
        </p>
      )}
    </div>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  accent = "orange",
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  accent?: "orange" | "red";
}) {
  const activeStyle =
    accent === "red"
      ? "bg-red-500/[0.07] text-red-600 dark:bg-red-500/[0.12] dark:text-red-400"
      : "bg-orange-500/[0.07] text-orange-600 dark:bg-orange-500/[0.12] dark:text-orange-400";

  const activeBar =
    accent === "red"
      ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]"
      : "bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.4)]";

  if (collapsed) {
    return (
      <Link
        href={item.href}
        title={item.label}
        className={`relative mx-auto mb-0.5 flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${
          active
            ? activeStyle
            : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
        }`}
        aria-current={active ? "page" : undefined}
      >
        {active && (
          <span
            className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full ${activeBar}`}
          />
        )}
        {item.icon}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      className={`group relative mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
        active
          ? activeStyle
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-zinc-800/60 dark:hover:text-gray-200"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {active && (
        <span
          className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full ${activeBar}`}
        />
      )}
      <span
        className={`shrink-0 transition-opacity ${active ? "" : "opacity-50 group-hover:opacity-100"}`}
      >
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && (
        <span
          className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${
            accent === "red"
              ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
          }`}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function SectionGroup({
  section,
  isOpen,
  onToggle,
  sidebarCollapsed,
  role,
  isActive,
}: {
  section: SectionDef;
  isOpen: boolean;
  onToggle: () => void;
  sidebarCollapsed: boolean;
  role: Role;
  isActive: (href: string) => boolean;
}) {
  const accent = section.accent ?? "orange";
  const visibleItems = section.items.filter((item) => canSeeNavItem(role, item));

  if (!visibleItems.length) return null;

  const hasActive = visibleItems.some((item) => isActive(item.href));

  if (sidebarCollapsed) {
    return (
      <div className="mb-1 flex flex-col items-center">
        <div
          className="my-1.5 h-px w-5 bg-gray-200 dark:bg-zinc-800"
          title={section.label}
        />
        {visibleItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            collapsed
            accent={accent}
          />
        ))}
      </div>
    );
  }

  const hasAccent = !!section.accent;
  const headerBase =
    "group mt-1 flex w-full select-none items-center gap-2.5 rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150";

  const headerColor = hasAccent
    ? accent === "red"
      ? hasActive || isOpen
        ? "text-red-500 dark:text-red-400"
        : "text-gray-400 hover:text-red-400 dark:text-gray-500 dark:hover:text-red-400"
      : hasActive || isOpen
        ? "text-orange-500 dark:text-orange-400"
        : "text-gray-400 hover:text-orange-500 dark:text-gray-500 dark:hover:text-orange-400"
    : hasActive || isOpen
      ? "text-gray-700 dark:text-gray-200"
      : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300";

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={onToggle}
        className={`${headerBase} ${headerColor}`}
      >
        <span
          className={`shrink-0 transition-opacity ${!hasActive && !isOpen ? "opacity-60 group-hover:opacity-100" : ""}`}
        >
          {section.icon}
        </span>
        <span className="flex-1 text-left">{section.label}</span>
        {hasActive && !isOpen && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${accent === "red" ? "bg-red-400" : "bg-orange-400"}`}
          />
        )}
        <ChevronDown
          size={11}
          className={`shrink-0 opacity-50 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
        />
      </button>

      {isOpen && (
        <div className="ml-3 mt-0.5 border-l border-gray-100 pl-2.5 pb-1 dark:border-zinc-800">
          {visibleItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              collapsed={false}
              accent={accent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Props ─── */
interface SidebarProps {
  storageUsed?: number;
  storageQuota?: number;
  storageLoading?: boolean;
  onUpload?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

/* ════════════════════════════════════════
   SIDEBAR
════════════════════════════════════════ */
function Sidebar({
  storageUsed = 0,
  storageQuota = 0,
  storageLoading = false,
  onUpload,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const { user, logout } = useAuth();
  const navRef = useRef<HTMLElement>(null);

  const [collapsed, setCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(COLLAPSED_KEY) === "true",
  );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => {
      const defaults = Object.fromEntries(
        SECTIONS.map((s) => [s.key, s.openByDefault ?? false]),
      );
      if (typeof window === "undefined") return defaults;

      const activeKey = getActiveSectionKey(
        window.location.pathname,
        new URLSearchParams(window.location.search),
      );
      try {
        const stored = JSON.parse(
          localStorage.getItem(SECTIONS_KEY) ?? "{}",
        ) as Record<string, boolean>;
        return Object.fromEntries(
          SECTIONS.map((s) => [
            s.key,
            s.key === activeKey
              ? true
              : s.key in stored
                ? stored[s.key]
                : (s.openByDefault ?? false),
          ]),
        );
      } catch {
        return activeKey ? { ...defaults, [activeKey]: true } : defaults;
      }
    },
  );

  const [showLogout, setShowLogout] = useState(false);

  /* Close mobile sidebar on navigation */
  useEffect(() => {
    if (mobileOpen) onMobileClose?.();
  }, [pathname, currentSearch, mobileOpen, onMobileClose]);

  useEffect(() => {
    const activeKey = getActiveSectionKey(
      pathname,
      new URLSearchParams(currentSearch),
    );
    if (!activeKey || openSections[activeKey]) return;

    const id = window.setTimeout(() => {
      setOpenSections((prev) => {
        if (prev[activeKey]) return prev;
        const next = { ...prev, [activeKey]: true };
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
        return next;
      });
    }, 0);

    return () => window.clearTimeout(id);
  }, [currentSearch, openSections, pathname]);

  /* Body scroll lock */
  useEffect(() => {
    if (!showLogout) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [showLogout]);

  /* Escape to close logout modal */
  useEffect(() => {
    if (!showLogout) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowLogout(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [showLogout]);

  const role = useMemo(() => normalizeRole(user?.role), [user?.role]);
  const isAdmin = role === "ADMIN" || role === "SUPERADMIN";
  const isSuperAdmin = role === "SUPERADMIN";

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSED_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isActive = useCallback(
    (href: string): boolean => isHrefActive(href, pathname, searchParams),
    [pathname, searchParams],
  );

  const activeSectionKey = useMemo(
    () => getActiveSectionKey(pathname, new URLSearchParams(currentSearch)),
    [currentSearch, pathname],
  );
  const activeSectionReady = !activeSectionKey || collapsed || !!openSections[activeSectionKey];

  useEffect(() => {
    if (!activeSectionReady) return;

    const frame = window.requestAnimationFrame(() => {
      const nav = navRef.current;
      const activeItem = nav?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!nav || !activeItem) return;

      const navTop = nav.getBoundingClientRect().top;
      const itemTop = activeItem.getBoundingClientRect().top;
      nav.scrollTo({
        top: Math.max(0, nav.scrollTop + itemTop - navTop - 4),
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeSectionReady, collapsed, currentSearch, pathname]);

  const usedPct = useMemo(() => {
    if (!storageQuota || storageQuota <= 0) return 0;
    return Math.min((storageUsed / storageQuota) * 100, 100);
  }, [storageUsed, storageQuota]);
  const hasStorageQuota = storageQuota > 0;
  const storageAvailable = Math.max(storageQuota - storageUsed, 0);
  const storageLabel = hasStorageQuota
    ? `${formatBytes(storageUsed)} / ${formatBytes(storageQuota)}`
    : `${formatBytes(storageUsed)} used`;
  const storageTitle = storageLoading
    ? "Loading storage usage"
    : hasStorageQuota
      ? `${storageLabel} (${usedPct.toFixed(0)}% used)`
      : storageLabel;
  const storageIconClass = hasStorageQuota && usedPct >= 90
    ? "text-red-500"
    : "text-orange-400";

  const storageGradient =
    hasStorageQuota && usedPct >= 90
      ? "from-red-500 to-rose-600"
      : hasStorageQuota && usedPct >= 75
        ? "from-amber-500 to-orange-500"
        : "from-orange-400 via-amber-400 to-yellow-300";

  const roleBadge = useMemo(
    () =>
      isSuperAdmin
        ? {
            label: "Super Admin",
            icon: <Shield size={9} />,
            cls: "bg-red-50 text-red-600 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-800/40",
          }
        : isAdmin
          ? {
              label: "Admin",
              icon: <Crown size={9} />,
              cls: "bg-orange-50 text-orange-600 ring-1 ring-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:ring-orange-800/40",
            }
          : {
              label: "User",
              icon: <UserCheck size={9} />,
              cls: "bg-gray-100 text-gray-500 ring-1 ring-gray-200 dark:bg-zinc-800 dark:text-gray-400 dark:ring-zinc-700",
            },
    [isSuperAdmin, isAdmin],
  );

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      setShowLogout(false);
    }
  }, [logout]);

  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => !s.minRole || hasRole(role, s.minRole)),
    [role],
  );

  const moduleCount = useMemo(
    () =>
      1 +
      visibleSections.reduce(
        (sum, section) =>
          sum +
          section.items.filter((item) => canSeeNavItem(role, item)).length,
        0,
      ) +
      PREFERENCES.length,
    [visibleSections, role],
  );

  /* ════════════════════════════════════
     RENDER
  ════════════════════════════════════ */
  return (
    <>
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex h-screen flex-col overflow-hidden",
          "border-r border-gray-200/70 bg-white dark:border-zinc-800/60 dark:bg-zinc-950",
          "transition-[width,transform] duration-300 ease-in-out",
          "lg:sticky lg:top-0 lg:z-auto lg:shrink-0 lg:translate-x-0",
          `w-68 ${collapsed ? "lg:w-18" : "lg:w-68"}`,
          mobileOpen
            ? "translate-x-0 shadow-2xl shadow-black/25"
            : "-translate-x-full",
        ].join(" ")}
        aria-label="Application navigation"
      >
        {/* ── Header ── */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200/70 px-3 dark:border-zinc-800/60">
          {!collapsed ? (
            <Link
              href="/dashboard"
              className="group flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40"
            >
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-orange-500/15 to-amber-400/10 ring-1 ring-orange-400/30 transition-all duration-200 group-hover:scale-105 group-hover:ring-orange-500/60">
                <Image
                  src={ImgHelper.logo.jai_logo}
                  alt="Jai Export Enterprises"
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold leading-none text-gray-900 dark:text-white">
                  Jai Export Enterprises
                </p>
                <p className="mt-0.5 truncate text-[10.5px] font-medium text-gray-400 dark:text-gray-500">
                  File Transfer
                </p>
              </div>
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="group mx-auto rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-orange-500/15 to-amber-400/10 ring-1 ring-orange-400/30 transition-all duration-200 group-hover:scale-105 group-hover:ring-orange-500/60">
                <Image
                  src={ImgHelper.logo.jai_logo}
                  alt="Jai Export Enterprises"
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain"
                />
              </div>
            </Link>
          )}

          {!collapsed && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                className="hidden h-8 w-8 rounded-lg text-gray-400 hover:text-gray-600 lg:flex"
                aria-label="Collapse sidebar"
              >
                <ChevronRight
                  size={15}
                  className="rotate-180 transition-transform duration-300"
                />
              </Button>
              <button
                type="button"
                onClick={onMobileClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800 lg:hidden"
                aria-label="Close sidebar"
              >
                <X size={15} />
              </button>
            </>
          )}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mx-auto mt-2 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-orange-50 hover:text-orange-500 dark:hover:bg-zinc-800 dark:hover:text-orange-400"
            aria-label="Expand sidebar"
          >
            <ChevronRight size={14} />
          </button>
        )}

        {/* ── Upload CTA ── */}
        <div className="shrink-0 px-3 py-3">
          <Button
            onClick={onUpload}
            fullWidth
            leftIcon={collapsed ? undefined : <Upload size={14} />}
            title="Upload Files & Folders"
            className={`h-9 rounded-xl text-[12.5px] font-semibold shadow-md shadow-orange-500/20 ${collapsed ? "px-0" : ""}`}
          >
            {collapsed ? <Upload size={16} /> : "Upload Files"}
          </Button>
        </div>

        {!collapsed && (
          <WorkspaceSnapshot
            usedPct={usedPct}
            storageUsed={storageUsed}
            storageAvailable={storageAvailable}
            storageLoading={storageLoading}
            storageLabel={storageLabel}
            storageTitle={storageTitle}
            hasStorageQuota={hasStorageQuota}
            roleLabel={roleBadge.label}
            moduleCount={moduleCount}
          />
        )}

        {/* ── Navigation ── */}
        <nav
          ref={navRef}
          className="flex-1 overflow-y-auto px-2 pb-3 scrollbar-hide"
          aria-label="Main navigation"
        >
          {/* Dashboard */}
          <NavLink
            item={DASHBOARD_ITEM}
            active={pathname === "/dashboard"}
            collapsed={collapsed}
          />

          {/* Collapsed: sections as thin dividers + icon items */}
          {collapsed ? (
            <>
              {visibleSections.map((section) => {
                const items = section.items.filter((item) => canSeeNavItem(role, item));
                if (!items.length) return null;
                return (
                  <div
                    key={section.key}
                    className="mb-1 flex flex-col items-center"
                  >
                    <div className="my-1.5 h-px w-5 bg-gray-200 dark:bg-zinc-800" />
                    {items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        active={isActive(item.href)}
                        collapsed
                        accent={section.accent ?? "orange"}
                      />
                    ))}
                  </div>
                );
              })}
              <div className="my-1.5 mx-auto h-px w-5 bg-gray-200 dark:bg-zinc-800" />
              {PREFERENCES.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  collapsed
                />
              ))}
            </>
          ) : (
            <>
              {/* Expanded: accordion sections */}
              <div className="mt-1">
                {visibleSections.map((section) => (
                  <SectionGroup
                    key={section.key}
                    section={section}
                    isOpen={!!openSections[section.key]}
                    onToggle={() => toggleSection(section.key)}
                    sidebarCollapsed={false}
                    role={role}
                    isActive={isActive}
                  />
                ))}
              </div>

              {/* Preferences */}
              <div className="my-3 flex items-center gap-2.5 px-3">
                <div className="h-px flex-1 bg-linear-to-r from-transparent via-gray-200 to-transparent dark:via-zinc-800" />
                <p className="select-none text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">
                  Preferences
                </p>
                <div className="h-px flex-1 bg-linear-to-r from-transparent via-gray-200 to-transparent dark:via-zinc-800" />
              </div>
              {PREFERENCES.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  collapsed={false}
                />
              ))}
            </>
          )}
        </nav>

        {/* ── Storage (expanded) ── */}
        {!collapsed && (
          <div className="shrink-0 border-t border-gray-200/70 px-4 py-3.5 dark:border-zinc-800/60">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <HardDrive size={11} className={storageIconClass} />
                <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  Storage
                </span>
              </div>
              {storageLoading ? (
                <span className="inline-block h-3 w-20 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
              ) : (
                <span
                  className="max-w-36 truncate text-[10.5px] font-semibold text-gray-700 dark:text-gray-200"
                  title={storageTitle}
                >
                  {storageLabel}
                  {hasStorageQuota && (
                    <span className="ml-1 font-normal text-gray-400 dark:text-gray-500">
                      {usedPct.toFixed(0)}%
                    </span>
                  )}
                </span>
              )}
            </div>
            <StorageBar
              pct={storageLoading ? 0 : usedPct}
              gradient={storageGradient}
            />
            {!storageLoading &&
              (hasStorageQuota && usedPct >= 90 ? (
                <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                  <AlertTriangle size={9} /> Storage almost full
                </p>
              ) : !hasStorageQuota ? (
                <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                  No quota set
                </p>
              ) : (
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                  <span>{usedPct.toFixed(0)}% used</span>
                  <span className="inline-flex items-center gap-1 font-medium text-orange-400">
                    <PackageCheck size={9} />
                    {formatBytes(storageAvailable)} free
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* ── Storage strip (collapsed) ── */}
        {collapsed && !storageLoading && (
          <div className="shrink-0 border-t border-gray-200/70 px-3 py-3 dark:border-zinc-800/60">
            <div title={storageTitle}>
              <StorageBar pct={usedPct} gradient={storageGradient} />
            </div>
          </div>
        )}

        {/* ── User footer ── */}
        <div className="shrink-0 border-t border-gray-200/70 p-3 dark:border-zinc-800/60">
          {!collapsed && (
            <div className="mb-2.5 px-1">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${roleBadge.cls}`}
              >
                {roleBadge.icon}
                {roleBadge.label}
              </span>
            </div>
          )}
          <div
            className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-2.5"}`}
          >
            <Link
              href="/profile"
              className="shrink-0 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-orange-400/40"
              title={collapsed ? (user?.name ?? "Profile") : undefined}
            >
              <Avatar name={user?.name ?? "User"} size={34} />
            </Link>
            {!collapsed && (
              <>
                <Link
                  href="/profile"
                  className="group min-w-0 flex-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40"
                >
                  <p className="truncate text-[12.5px] font-semibold leading-none text-gray-900 transition-colors group-hover:text-orange-500 dark:text-white dark:group-hover:text-orange-400">
                    {user?.name ?? "—"}
                  </p>
                  <p className="mt-0.5 truncate text-[10.5px] text-gray-400 dark:text-gray-500">
                    {user?.email ?? "—"}
                  </p>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowLogout(true)}
                  className="h-8 w-8 shrink-0 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut size={15} />
                </Button>
              </>
            )}
            {collapsed && (
              <button
                type="button"
                onClick={() => setShowLogout(true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Logout confirmation modal ── */}
      {showLogout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-title"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setShowLogout(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-xs animate-in fade-in zoom-in-95 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-2xl shadow-black/20 duration-150 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-red-50 to-rose-50 text-red-500 ring-1 ring-red-200 dark:from-red-950/40 dark:to-rose-950/30 dark:ring-red-800/40">
              <LogOut size={20} />
            </div>
            <h2
              id="logout-title"
              className="mb-1 text-base font-bold text-gray-900 dark:text-white"
            >
              Sign out?
            </h2>
            <p className="mb-5 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
              You&apos;ll need to sign in again to access your files.
            </p>
            <div className="flex flex-col gap-2.5">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setShowLogout(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                fullWidth
                leftIcon={<LogOut size={15} />}
                onClick={handleLogout}
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(Sidebar);
