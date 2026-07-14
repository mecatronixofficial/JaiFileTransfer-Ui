"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Settings,
  Search,
  CheckCheck,
  X,
  Sparkles,
  Share2,
  Download,
  Upload,
  Users,
  Award,
  LogOut,
  User,
  HelpCircle,
  ChevronDown,
  FolderPlus,
  FileText,
  Grid3x3,
  List,
  Loader2,
  AlertTriangle,
  Menu,
  HardDrive,
  FolderOpen,
  Link2,
  QrCode,
  Mail,
  ArrowLeftRight,
  LayoutDashboard,
  Trash2,
  Star,
  UserCog,
} from "lucide-react";

import { notificationsApi, searchApi } from "@/lib/api";
import {
  formatBytes,
  formatRelative,
  getWorkspaceLocale,
  usesTwelveHourClock,
} from "@/lib/utils";
import { Notification } from "@/types";
import { Avatar } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { showToast } from "@/lib/toast";
import Button from "../ui/Button";
import { getNotificationsFromResponse } from "@/lib/notifications";

/* =========================
   TYPES
========================= */

interface SearchResult {
  id: number | string;
  type: "file" | "folder" | "user";
  name: string;
  path?: string;
  email?: string;
}

interface HeaderProps {
  onMobileSidebarOpen?: () => void;
  onUpload?: () => void;
  storageUsed?: number;
  storageQuota?: number;
  storageLoading?: boolean;
}

/* =========================
   CONSTANTS
========================= */

const NOTIF_POLL_INTERVAL_MS = 30_000;

const NOTIF_ICONS: Record<string, ReactNode> = {
  share:       <Share2 size={15} />,
  upload:      <Upload size={15} />,
  download:    <Download size={15} />,
  system:      <Sparkles size={15} />,
  user:        <Users size={15} />,
  achievement: <Award size={15} />,
  file_shared:     <Share2 size={15} />,
  file_deleted:    <Trash2 size={15} />,
  file_restored:   <FolderOpen size={15} />,
  transfer_sent:   <ArrowLeftRight size={15} />,
  file_uploaded:   <Upload size={15} />,
  file_downloaded: <Download size={15} />,
  folder_created:  <FolderPlus size={15} />,
  link_created:    <Link2 size={15} />,
  user_added:      <Users size={15} />,
  alert:           <AlertTriangle size={15} />,
};

const NOTIF_ACCENT: Record<string, { icon: string; dot: string; bg: string }> = {
  share:       { icon: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",       dot: "bg-blue-500",   bg: "border-l-2 border-l-blue-400" },
  upload:      { icon: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",   dot: "bg-green-500",  bg: "border-l-2 border-l-green-400" },
  download:    { icon: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400", dot: "bg-purple-500", bg: "border-l-2 border-l-purple-400" },
  system:      { icon: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400", dot: "bg-orange-500", bg: "border-l-2 border-l-orange-400" },
  achievement: { icon: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",   dot: "bg-amber-500",  bg: "border-l-2 border-l-amber-400" },
  file_shared:     { icon: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",       dot: "bg-blue-500",   bg: "border-l-2 border-l-blue-400" },
  file_deleted:    { icon: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",           dot: "bg-red-500",    bg: "border-l-2 border-l-red-400" },
  file_restored:   { icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400", dot: "bg-emerald-500", bg: "border-l-2 border-l-emerald-400" },
  transfer_sent:   { icon: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400",           dot: "bg-sky-500",    bg: "border-l-2 border-l-sky-400" },
  file_uploaded:   { icon: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",   dot: "bg-green-500",  bg: "border-l-2 border-l-green-400" },
  file_downloaded: { icon: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400", dot: "bg-purple-500", bg: "border-l-2 border-l-purple-400" },
  folder_created:  { icon: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",   dot: "bg-amber-500",  bg: "border-l-2 border-l-amber-400" },
  link_created:    { icon: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400", dot: "bg-violet-500", bg: "border-l-2 border-l-violet-400" },
  user_added:      { icon: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400", dot: "bg-indigo-500", bg: "border-l-2 border-l-indigo-400" },
  alert:           { icon: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",           dot: "bg-red-500",    bg: "border-l-2 border-l-red-400" },
  default:     { icon: "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400",          dot: "bg-gray-400",   bg: "border-l-2 border-l-gray-300 dark:border-l-zinc-600" },
};

const USER_MENU_ITEMS = [
  { href: "/profile",  icon: User,        label: "My Profile" },
  { href: "/settings", icon: Settings,    label: "Settings" },
  { href: "/help",     icon: HelpCircle,  label: "Help & Support" },
] as const;

/* =========================
   HELPERS
========================= */

function formatRelativeTime(date: string | Date | number): string {
  return formatRelative(typeof date === "number" ? new Date(date) : date) || "Unknown time";
}

function formatFullTime(date: string | Date | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(getWorkspaceLocale(), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: usesTwelveHourClock(),
  }).format(d);
}

function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getRouteContext(pathname: string, type: string | null): { title: string; subtitle: string; icon: ReactNode } {
  if (pathname === "/dashboard") return { title: "Dashboard", subtitle: "Workspace overview", icon: <LayoutDashboard size={15} /> };
  if (pathname === "/files") {
    const labels: Record<string, string> = {
      document: "Documents",
      image: "Images",
      video: "Videos",
      spreadsheet: "Spreadsheets",
    };
    return { title: labels[type ?? ""] ?? "Files", subtitle: type ? "Filtered library" : "All storage files", icon: <FileText size={15} /> };
  }
  if (pathname === "/folders") return { title: "Folders", subtitle: "Organized project storage", icon: <FolderOpen size={15} /> };
  if (pathname === "/links") {
    if (type === "qr") return { title: "QR Shares", subtitle: "QR-based shared access", icon: <QrCode size={15} /> };
    if (type === "email") return { title: "Email Shares", subtitle: "Email delivery links", icon: <Mail size={15} /> };
    return { title: "Shared Links", subtitle: "Link-based shared access", icon: <Link2 size={15} /> };
  }
  if (pathname.startsWith("/transfers")) return { title: "Transfers", subtitle: "Send and receive files", icon: <ArrowLeftRight size={15} /> };
  if (pathname === "/notifications") return { title: "Notifications", subtitle: "Alerts and activity updates", icon: <Bell size={15} /> };
  if (pathname === "/shared") return { title: "Shared", subtitle: "Files shared with you", icon: <Share2 size={15} /> };
  if (pathname === "/starred") return { title: "Starred", subtitle: "Pinned files and folders", icon: <Star size={15} /> };
  if (pathname === "/trash") return { title: "Trash", subtitle: "Deleted items and recovery", icon: <Trash2 size={15} /> };
  if (pathname === "/search") return { title: "Search", subtitle: "Find files and folders", icon: <Search size={15} /> };
  if (pathname === "/profile") return { title: "Profile", subtitle: "Account details", icon: <User size={15} /> };
  if (pathname === "/settings") return { title: "Settings", subtitle: "Preferences and security", icon: <Settings size={15} /> };
  if (pathname === "/help") return { title: "Help", subtitle: "Support and guidance", icon: <HelpCircle size={15} /> };
  if (pathname.startsWith("/admin")) return { title: "Administration", subtitle: "Platform management", icon: <Settings size={15} /> };
  if (pathname.startsWith("/superadmin/roles")) return { title: "Roles", subtitle: "Access model and permissions", icon: <UserCog size={15} /> };
  if (pathname.startsWith("/superadmin")) return { title: "System", subtitle: "Super admin controls", icon: <AlertTriangle size={15} /> };
  return { title: "Jai Export Enterprises", subtitle: "File Transfer", icon: <Sparkles size={15} /> };
}

/* =========================
   ICON BUTTON
========================= */
function IconBtn({
  onClick, label, children, className = "",
}: {
  onClick?: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`relative flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-orange-500 dark:text-gray-400 dark:hover:bg-zinc-800/80 dark:hover:text-orange-400 ${className}`}
    >
      {children}
    </button>
  );
}

/* =========================
   COMPONENT
========================= */

export default function Header({
  onMobileSidebarOpen,
  onUpload,
  storageUsed = 0,
  storageQuota = 0,
  storageLoading = false,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUserId = user?.id ?? (user as { _id?: string } | null)?._id;

  const [notifs, setNotifs]           = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs]   = useState(false);
  const [showSearch, setShowSearch]   = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [viewMode, setViewMode]       = useState<"grid" | "list">(() => {
    try {
      const saved = localStorage.getItem("viewMode");
      if (saved === "grid" || saved === "list") return saved;
    } catch { /* ignore */ }
    return "grid";
  });
  const [searchFocusIndex, setSearchFocusIndex] = useState(-1);

  const notifRef      = useRef<HTMLDivElement>(null);
  const userMenuRef   = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const debouncedSearch = useDebounce(searchQuery, 400);

  /* =========================
     DERIVED
  ========================= */
  const unread = useMemo(() => notifs.filter((n) => !n.isRead).length, [notifs]);
  const routeContext = useMemo(
    () => getRouteContext(pathname, searchParams.get("type")),
    [pathname, searchParams],
  );
  const storagePct = useMemo(() => {
    if (!storageQuota || storageQuota <= 0) return 0;
    return Math.min((storageUsed / storageQuota) * 100, 100);
  }, [storageUsed, storageQuota]);
  const hasStorageQuota = storageQuota > 0;
  const storageLabel = hasStorageQuota
    ? `${formatBytes(storageUsed)} / ${formatBytes(storageQuota)}`
    : `${formatBytes(storageUsed)} used`;
  const storageTitle = storageLoading
    ? "Loading storage usage"
    : hasStorageQuota
      ? `${storageLabel} (${storagePct.toFixed(0)}% used)`
      : storageLabel;
  const storageIconClass = hasStorageQuota && storagePct >= 90
    ? "text-red-500"
    : "text-orange-500";
  /* =========================
     LOAD NOTIFICATIONS
  ========================= */
  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationsApi.list({ limit: 8 });
      setNotifs(getNotificationsFromResponse(res.data, { currentUserId }));
    } catch { /* Silent */ }
  }, [currentUserId]);

  useEffect(() => {
    let mounted = true;
    const tick = async () => { if (mounted) await loadNotifications(); };
    tick();
    const id = setInterval(tick, NOTIF_POLL_INTERVAL_MS);
    return () => { mounted = false; clearInterval(id); };
  }, [loadNotifications]);

  /* =========================
     CLICK-OUTSIDE
  ========================= */
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const t = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(t)) setShowNotifs(false);
      if (userMenuRef.current && !userMenuRef.current.contains(t)) setShowUserMenu(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  /* =========================
     KEYBOARD SHORTCUTS
  ========================= */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearch(true);
        setSearchFocusIndex(-1);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }
      if (e.key === "Escape") {
        if (showSearch)       { setShowSearch(false); setSearchQuery(""); setSearchFocusIndex(-1); return; }
        if (showNotifs)       return setShowNotifs(false);
        if (showUserMenu)     return setShowUserMenu(false);
        if (showLogoutModal)  return setShowLogoutModal(false);
      }
      if (showSearch && searchResults.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSearchFocusIndex((i) => { const n = Math.min(i + 1, searchResults.length - 1); searchResultRefs.current[n]?.focus(); return n; });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSearchFocusIndex((i) => { if (i <= 0) { searchInputRef.current?.focus(); return -1; } searchResultRefs.current[i - 1]?.focus(); return i - 1; });
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showSearch, showNotifs, showUserMenu, showLogoutModal, searchResults.length]);

  /* =========================
     BODY SCROLL LOCK
  ========================= */
  useEffect(() => {
    if (!showLogoutModal) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, [showLogoutModal]);

  /* =========================
     SEARCH
  ========================= */
  const performSearch = useCallback(async (q: string) => {
    setIsSearching(true);
    try {
      const res = await searchApi.search(q, { limit: 10 });
      const raw = (res.data?.data ?? res.data ?? {}) as Record<string, unknown>;
      const results: SearchResult[] = [];
      readArray(raw.files).forEach((f) => results.push({
        id: readString(f._id) || readString(f.id),
        type: "file",
        name: readString(f.fileName) || readString(f.name) || readString(f.originalName),
        path: readString(f.path) || readString(f.folderId) || "/",
      }));
      readArray(raw.folders).forEach((f) => results.push({
        id: readString(f._id) || readString(f.id),
        type: "folder",
        name: readString(f.name),
        path: readString(f.path) || readString(f.parentId) || "/",
      }));
      readArray(raw.users).forEach((u) => results.push({
        id: readString(u._id) || readString(u.id),
        type: "user",
        name: readString(u.name) || readString(u.email),
        email: readString(u.email),
      }));
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    searchResultRefs.current = [];
    const q = debouncedSearch.trim();
    Promise.resolve().then(() => {
      if (q) performSearch(q);
      else setSearchResults([]);
    });
  }, [debouncedSearch, performSearch]);

  const openSearch = useCallback(() => {
    setShowSearch(true);
    setSearchFocusIndex(-1);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery("");
    setSearchFocusIndex(-1);
  }, []);

  /* =========================
     NOTIF ACTIONS
  ========================= */
  const markRead = useCallback(async (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await notificationsApi.markRead(id);
    } catch {
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
      showToast.error("Failed to mark as read");
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const unreadIds = notifs.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const snapshot = notifs.slice();
    setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await notificationsApi.bulkMarkRead(unreadIds);
      showToast.success("All notifications marked as read");
    } catch {
      setNotifs(snapshot);
      showToast.error("Failed to mark all as read");
    }
  }, [notifs]);

  /* =========================
     LOGOUT
  ========================= */
  const handleLogout = useCallback(async () => {
    setShowLogoutModal(false);
    setShowUserMenu(false);
    try {
      await logout();
      showToast.success("Logged out successfully");
    } catch {
      showToast.error("Failed to logout");
    }
  }, [logout]);

  /* =========================
     VIEW MODE
  ========================= */
  const handleViewModeChange = useCallback((mode: "grid" | "list") => {
    setViewMode(mode);
    try { localStorage.setItem("viewMode", mode); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("viewModeChange", { detail: mode }));
  }, []);

  /* =========================
     SEARCH NAV
  ========================= */
  const navigateSearchResult = useCallback((result: SearchResult) => {
    if (result.type === "file") router.push(`/files?search=${encodeURIComponent(result.name)}`);
    else if (result.type === "folder") router.push(`/folders?search=${encodeURIComponent(result.name)}`);
    else router.push(`/admin/users?search=${encodeURIComponent(result.email ?? result.name)}`);
    closeSearch();
  }, [router, closeSearch]);

  /* =========================
     NOTIF ACCENT HELPER
  ========================= */
  const getAccent = (type: string) => NOTIF_ACCENT[type] ?? NOTIF_ACCENT.default;

  /* =========================
     RENDER
  ========================= */
  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-gray-200/70 bg-white/80 px-4 backdrop-blur-xl transition-colors duration-200 dark:border-zinc-800/60 dark:bg-zinc-950/80 sm:px-6">

        {/* ── LEFT ── */}
        <div className="flex items-center gap-2.5">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={onMobileSidebarOpen}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-orange-500 dark:text-gray-400 dark:hover:bg-zinc-800 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu size={19} />
          </button>

          {/* Current project area */}
          <div className="hidden min-w-0 items-center gap-2 rounded-xl border border-gray-200/70 bg-gray-50/60 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/60 sm:flex">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500 dark:bg-orange-500/10 dark:text-orange-400">
              {routeContext.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-bold leading-none text-gray-900 dark:text-white">
                {routeContext.title}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-gray-400 dark:text-gray-500">
                {routeContext.subtitle}
              </span>
            </span>
          </div>

        </div>

        {/* ── RIGHT ── */}
        <div className="flex items-center gap-1.5">

          {/* Search — desktop */}
          <button
            type="button"
            onClick={openSearch}
            className="group hidden h-9 w-64 items-center gap-2.5 rounded-xl border border-gray-200/80 bg-gray-50/50 px-3 text-[13px] text-gray-400 transition-all duration-200 hover:border-orange-300/80 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-orange-700/50 dark:hover:bg-zinc-900 md:flex xl:w-72"
            aria-label="Open search"
          >
            <Search size={14} className="shrink-0 text-gray-400 transition-colors group-hover:text-orange-500" />
            <span className="flex-1 text-left">Search {routeContext.title.toLowerCase()}, files…</span>
            <kbd className="hidden items-center gap-0.5 rounded-md border border-gray-200/80 bg-white px-1.5 py-0.5 text-[9px] font-medium text-gray-400 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-500 sm:flex">
              ⌘K
            </kbd>
          </button>

          {/* Search — mobile */}
          <IconBtn onClick={openSearch} label="Search" className="md:hidden">
            <Search size={17} />
          </IconBtn>

          {/* Quick action */}
          <IconBtn
            onClick={onUpload}
            label="Upload files"
            className="hidden sm:flex"
          >
            <Upload size={17} />
          </IconBtn>

          {/* Storage — desktop */}
          <div
            className="hidden items-center gap-2 rounded-xl border border-gray-200/80 bg-white px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900 lg:flex"
            title={storageTitle}
          >
            <HardDrive size={14} className={storageIconClass} />
            {storageLoading ? (
              <span className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
            ) : (
              <span className="max-w-40 truncate text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                {storageLabel}
                {hasStorageQuota && (
                  <span className="ml-1 font-normal text-gray-400">
                    {storagePct.toFixed(0)}%
                  </span>
                )}
              </span>
            )}
          </div>

          {/* ── NOTIFICATIONS ── */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setShowNotifs((s) => !s)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 ${
                showNotifs
                  ? "bg-orange-50 text-orange-500 dark:bg-orange-500/10 dark:text-orange-400"
                  : "text-gray-500 hover:bg-gray-100 hover:text-orange-500 dark:text-gray-400 dark:hover:bg-zinc-800/80 dark:hover:text-orange-400"
              }`}
              aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
              aria-expanded={showNotifs}
              aria-haspopup="true"
            >
              <Bell size={17} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-linear-to-br from-orange-500 to-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white shadow-sm shadow-orange-500/40 dark:ring-zinc-950">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>

            {/* Notification panel */}
            {showNotifs && (
              <div
                className="absolute right-0 top-11 z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl shadow-black/10 duration-150 dark:border-zinc-800/80 dark:bg-zinc-900 sm:w-[26rem]"
                role="dialog"
                aria-label="Notifications"
              >
                {/* Panel header */}
                <div className="flex items-center justify-between border-b border-gray-100/80 px-5 py-3.5 dark:border-zinc-800/80">
                  <div>
                    <h3 className="text-[13px] font-bold text-gray-900 dark:text-white">Notifications</h3>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                      {unread > 0
                        ? `${unread} unread ${unread === 1 ? "message" : "messages"}`
                        : "You're all caught up"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {unread > 0 && (
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-orange-600 transition-colors hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10"
                      >
                        <CheckCheck size={12} />
                        Mark all read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowNotifs(false)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                      aria-label="Close notifications"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div className="max-h-[26rem] overflow-y-auto scrollbar-hide">
                  {notifs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                      <div className="mb-3.5 flex h-13 w-13 items-center justify-center rounded-2xl bg-gray-100 dark:bg-zinc-800">
                        <Bell size={22} className="text-gray-400" />
                      </div>
                      <p className="text-[13px] font-semibold text-gray-800 dark:text-white">No notifications yet</p>
                      <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                        We&apos;ll notify you when something happens
                      </p>
                    </div>
                  ) : (
                    notifs.map((n) => {
                      const accent = getAccent(n.type);
                      return (
                        <button
                          type="button"
                          key={n.id}
                          onClick={() => !n.isRead && markRead(n.id)}
                          className={`group w-full border-b border-gray-100/80 text-left transition-colors dark:border-zinc-800/60 ${
                            !n.isRead
                              ? `${accent.bg} hover:bg-gray-50 dark:hover:bg-zinc-800/50`
                              : "hover:bg-gray-50 dark:hover:bg-zinc-800/30"
                          }`}
                          aria-label={`${n.isRead ? "" : "Unread: "}${n.title}`}
                        >
                          <div className="flex gap-3 px-4 py-3.5">
                            <div
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                                !n.isRead ? accent.icon : "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400"
                              }`}
                            >
                              {NOTIF_ICONS[n.type] ?? <Bell size={14} />}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className={`truncate text-[12.5px] ${n.isRead ? "font-medium text-gray-600 dark:text-gray-300" : "font-semibold text-gray-900 dark:text-white"}`}>
                                  {n.title}
                                </h4>
                                {!n.isRead && (
                                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
                                )}
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                                {n.message}
                              </p>
                              <time
                                className="mt-1.5 block text-[10px] text-gray-400 dark:text-gray-500"
                                dateTime={new Date(n.createdAt).toISOString()}
                                title={formatFullTime(n.createdAt)}
                              >
                                {formatRelativeTime(n.createdAt)}
                              </time>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {notifs.length > 0 && (
                  <div className="border-t border-gray-100/80 bg-gray-50/50 px-5 py-3 text-center dark:border-zinc-800/80 dark:bg-zinc-950/50">
                    <Link
                      href="/notifications"
                      className="text-[11px] font-semibold text-orange-600 transition-colors hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                      onClick={() => setShowNotifs(false)}
                    >
                      View all notifications →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── USER MENU ── */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setShowUserMenu((s) => !s)}
              className={`flex items-center gap-1.5 rounded-xl border px-1.5 py-1 transition-all duration-200 ${
                showUserMenu
                  ? "border-orange-300/80 bg-orange-50/50 dark:border-orange-700/50 dark:bg-orange-500/10"
                  : "border-gray-200/80 bg-white hover:border-orange-300/60 hover:bg-orange-50/30 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-orange-700/40 dark:hover:bg-orange-900/10"
              }`}
              aria-label="User menu"
              aria-expanded={showUserMenu}
              aria-haspopup="true"
            >
              <Avatar name={user?.name || "User"} size={28} />
              <ChevronDown
                size={13}
                className={`mr-0.5 text-gray-400 transition-transform duration-200 ${showUserMenu ? "rotate-180" : ""}`}
              />
            </button>

            {showUserMenu && (
              <div
                className="absolute right-0 top-11 z-50 w-60 animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl shadow-black/8 duration-150 dark:border-zinc-800/80 dark:bg-zinc-900"
                role="menu"
              >
                {/* User info */}
                <div className="border-b border-gray-100/80 px-4 py-3.5 dark:border-zinc-800/80">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={user?.name || "User"} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">
                        {user?.name || "User"}
                      </p>
                      <p className="truncate text-[10.5px] text-gray-400 dark:text-gray-500">
                        {user?.email}
                      </p>
                    </div>
                  </div>
                  <span className="mt-2.5 inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-orange-600 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-800/40">
                    {user?.role || "User"}
                  </span>
                </div>

                {/* Menu items */}
                <div className="py-1.5" role="none">
                  {USER_MENU_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setShowUserMenu(false)}
                        className="group flex items-center gap-2.5 px-4 py-2 text-[13px] text-gray-700 transition-colors hover:bg-gray-50 hover:text-orange-600 dark:text-gray-300 dark:hover:bg-zinc-800/60 dark:hover:text-orange-400"
                      >
                        <Icon size={14} className="text-gray-400 transition-colors group-hover:text-orange-500" />
                        {item.label}
                      </Link>
                    );
                  })}

                  <div className="mx-3 my-1.5 h-px bg-gray-100 dark:bg-zinc-800" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setShowUserMenu(false); setShowLogoutModal(true); }}
                    className="group flex w-full items-center gap-2.5 px-4 py-2 text-[13px] text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <LogOut size={14} />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── COMMAND PALETTE ── */}
      {showSearch && (
        <div
          className="fixed inset-0 z-50 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          onClick={closeSearch}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          <div
            className="absolute left-1/2 top-[18%] w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-top-4 px-4 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl shadow-black/20 dark:border-zinc-800/80 dark:bg-zinc-900">
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-gray-100/80 px-4 py-3.5 dark:border-zinc-800/80">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-500/10">
                  <Search size={14} className="text-orange-500" aria-hidden />
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  role="combobox"
                  aria-expanded={searchResults.length > 0}
                  aria-autocomplete="list"
                  aria-controls="search-results"
                  placeholder="Search files, folders, or people…"
                  className="flex-1 bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
                  aria-label="Close search"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Results */}
              <div id="search-results" className="max-h-80 overflow-y-auto p-2 scrollbar-hide" role="listbox">
                {isSearching ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-gray-500">
                    <Loader2 size={15} className="animate-spin text-orange-500" />
                    Searching…
                  </div>
                ) : searchQuery && searchResults.length === 0 ? (
                  <div className="py-10 text-center text-[13px] text-gray-500 dark:text-gray-400">
                    No results for{" "}
                    <span className="font-semibold text-gray-900 dark:text-white">&ldquo;{searchQuery}&rdquo;</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-0.5">
                    {searchResults.map((r, i) => (
                      <button
                        type="button"
                        key={`${r.type}-${r.id}`}
                        ref={(el) => { searchResultRefs.current[i] = el; }}
                        role="option"
                        aria-selected={searchFocusIndex === i}
                        onClick={() => navigateSearchResult(r)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-100/80 focus:bg-gray-100/80 focus:outline-none dark:hover:bg-zinc-800/60 dark:focus:bg-zinc-800/60"
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          r.type === "file"   ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                          : r.type === "folder" ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                        }`}>
                          {r.type === "file"   && <FileText size={14} />}
                          {r.type === "folder" && <FolderPlus size={14} />}
                          {r.type === "user"   && <Users size={14} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-gray-900 dark:text-white">{r.name}</p>
                          <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">{r.path ?? r.email}</p>
                        </div>
                        <span className="rounded-md bg-gray-100/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
                          {r.type}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-5">
                    <div className="mb-4 text-center">
                      <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Start typing to search</p>
                      <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                        Files, folders, shares, and people
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { href: "/transfers/send", label: "New Transfer", icon: <Upload size={14} />, sub: "Send files" },
                        { href: "/folders", label: "Folders", icon: <FolderOpen size={14} />, sub: "Browse storage" },
                        { href: "/links", label: "Shared Links", icon: <Link2 size={14} />, sub: "Manage shares" },
                        { href: "/notifications", label: "Notifications", icon: <Bell size={14} />, sub: `${unread} unread` },
                      ].map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={closeSearch}
                          className="flex items-center gap-2 rounded-xl border border-gray-200/70 bg-gray-50/70 px-3 py-2.5 transition-colors hover:border-orange-200 hover:bg-orange-50 dark:border-zinc-800 dark:bg-zinc-950/40 dark:hover:border-orange-900/40 dark:hover:bg-orange-950/20"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-orange-500 ring-1 ring-gray-200 dark:bg-zinc-900 dark:ring-zinc-800">
                            {item.icon}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] font-semibold text-gray-800 dark:text-gray-200">{item.label}</span>
                            <span className="block truncate text-[10px] text-gray-400 dark:text-gray-500">{item.sub}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-gray-100/80 bg-gray-50/60 px-4 py-2.5 dark:border-zinc-800/80 dark:bg-zinc-950/60">
                <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
                  {[["↑↓", "Navigate"], ["↵", "Open"], ["Esc", "Close"]].map(([key, action]) => (
                    <span key={action} className="flex items-center gap-1">
                      <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[9px] font-medium shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
                        {key}
                      </kbd>
                      {action}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">Jai Export Enterprises</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOGOUT MODAL ── */}
      {showLogoutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-title"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setShowLogoutModal(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-sm animate-in fade-in zoom-in-95 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-2xl shadow-black/20 duration-150 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-red-50 to-rose-50 text-red-500 ring-1 ring-red-200 dark:from-red-950/40 dark:to-rose-950/30 dark:ring-red-800/40">
              <AlertTriangle size={20} />
            </div>
            <h2 id="logout-title" className="mb-1.5 text-[15px] font-bold text-gray-900 dark:text-white">
              Sign out?
            </h2>
            <p className="mb-5 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
              You&apos;ll need to sign in again to access your files.
            </p>
            <div className="flex flex-col gap-2.5">
              <Button variant="secondary" fullWidth onClick={() => setShowLogoutModal(false)}>
                Cancel
              </Button>
              <Button variant="danger" fullWidth leftIcon={<LogOut size={15} />} onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
