"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { notificationsApi } from "@/lib/api";
import { Notification } from "@/types";
import { Button, EmptyState } from "@/components/ui";
import { formatRelative } from "@/lib/utils";
import {
  Bell,
  CheckCheck,
  CheckSquare,
  Share2,
  Upload,
  Download,
  Trash2,
  RotateCcw,
  Send,
  FolderOpen,
  Link2,
  AlertCircle,
  UserPlus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { handleApiError } from "@/lib/error-handler";
import { showToast } from "@/lib/toast";
import { getNotificationsFromResponse, getUnreadCountFromResponse } from "@/lib/notifications";

/* ─── notification type → icon + icon-wrapper colour ─── */

interface NotifConfig {
  icon: React.ReactNode;
  bg: string;
}

const NOTIF_CONFIG: Record<string, NotifConfig> = {
  /* backend-generated types */
  file_shared:     { icon: <Share2    size={18} className="text-orange-500"  />, bg: "bg-orange-500/10  border-orange-200/60 dark:border-orange-500/25" },
  file_deleted:    { icon: <Trash2    size={18} className="text-red-500"     />, bg: "bg-red-500/10     border-red-200/60    dark:border-red-500/25"    },
  file_restored:   { icon: <RotateCcw size={18} className="text-emerald-500" />, bg: "bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/25" },
  transfer_sent:   { icon: <Send      size={18} className="text-blue-500"    />, bg: "bg-blue-500/10    border-blue-200/60   dark:border-blue-500/25"   },
  file_uploaded:   { icon: <Upload    size={18} className="text-emerald-500" />, bg: "bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/25" },
  file_downloaded: { icon: <Download  size={18} className="text-blue-500"    />, bg: "bg-blue-500/10    border-blue-200/60   dark:border-blue-500/25"   },
  folder_created:  { icon: <FolderOpen size={18} className="text-amber-500"  />, bg: "bg-amber-500/10   border-amber-200/60  dark:border-amber-500/25"  },
  link_created:    { icon: <Link2     size={18} className="text-purple-500"  />, bg: "bg-purple-500/10  border-purple-200/60 dark:border-purple-500/25" },
  user_added:      { icon: <UserPlus  size={18} className="text-indigo-500"  />, bg: "bg-indigo-500/10  border-indigo-200/60 dark:border-indigo-500/25" },
  alert:           { icon: <AlertCircle size={18} className="text-red-500"   />, bg: "bg-red-500/10     border-red-200/60    dark:border-red-500/25"    },
  /* legacy / short aliases */
  share:    { icon: <Share2    size={18} className="text-orange-500"  />, bg: "bg-orange-500/10  border-orange-200/60 dark:border-orange-500/25" },
  upload:   { icon: <Upload    size={18} className="text-emerald-500" />, bg: "bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/25" },
  download: { icon: <Download  size={18} className="text-blue-500"    />, bg: "bg-blue-500/10    border-blue-200/60   dark:border-blue-500/25"   },
  system:   { icon: <Bell      size={18} className="text-gray-400"    />, bg: "bg-gray-500/10    border-gray-200/60  dark:border-gray-500/25"    },
};

const DEFAULT_CONFIG: NotifConfig = {
  icon: <Bell size={18} className="text-gray-400" />,
  bg:   "bg-gray-500/10 border-gray-200/60 dark:border-gray-500/25",
};

const PAGE_SIZE = 20;

function getPaginationFromResponse(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const first = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const second = first.data && typeof first.data === "object" ? first.data as Record<string, unknown> : first;
  const pagination = second.pagination && typeof second.pagination === "object"
    ? second.pagination as Record<string, unknown>
    : {};
  const total = Number(pagination.total);
  const pages = Number(pagination.pages ?? pagination.totalPages);

  return {
    total: Number.isFinite(total) ? total : 0,
    pages: Number.isFinite(pages) ? Math.max(1, pages) : 1,
  };
}

function getConfig(type: string): NotifConfig {
  return NOTIF_CONFIG[type] ?? DEFAULT_CONFIG;
}

/* ─────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [unread, setUnread] = useState(0);

  const currentUserId = user?.id ?? (user as { _id?: string } | null)?._id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list({ page, limit: PAGE_SIZE });
      const next = getNotificationsFromResponse(res.data, { currentUserId });
      const pagination = getPaginationFromResponse(res.data);
      setNotifs(next);
      setTotal(pagination.total);
      setTotalPages(pagination.pages);
      if (page > pagination.pages) setPage(pagination.pages);
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const valid = new Set(next.map((n) => n.id));
        const kept = new Set([...prev].filter((id) => valid.has(id)));
        return kept.size === prev.size ? prev : kept;
      });
      const unreadRes = await notificationsApi.unreadCount();
      setUnread(getUnreadCountFromResponse(unreadRes.data));
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, page]);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  async function markRead(id: string) {
    try {
      await notificationsApi.markRead(id);
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnread((count) => Math.max(0, count - 1));
    } catch (err) {
      handleApiError(err);
    }
  }

  async function markAllRead() {
    if (unread === 0) return;

    try {
      await notificationsApi.markAllRead();
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
      showToast.success("All notifications marked as read");
    } catch (err) {
      handleApiError(err);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === notifs.length) return new Set();
      return new Set(notifs.map((n) => n.id));
    });
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setDeleting(true);
    try {
      await Promise.all(ids.map((id) => notificationsApi.deleteOne(id)));
      setSelectedIds(new Set());
      showToast.success(`${ids.length} notification${ids.length !== 1 ? "s" : ""} deleted`);
      if (notifs.length === ids.length && page > 1) {
        setPage((current) => current - 1);
      } else {
        await load();
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleting(false);
    }
  }

  const selectedCount = selectedIds.size;
  const allSelected = notifs.length > 0 && selectedCount === notifs.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const selectedUnread = useMemo(
    () => notifs.filter((n) => selectedIds.has(n.id) && !n.isRead).map((n) => n.id),
    [notifs, selectedIds],
  );
  const selectionLabel = selectedCount > 0
    ? `${selectedCount} selected`
    : `${total} total`;

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in mx-auto">

          {/* ── Header ── */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-[1.35rem] font-extrabold tracking-tight text-(--text-primary)">
                Notifications
              </h1>
              <p className="mt-0.5 text-[13px] text-(--text-muted)">
                {unread > 0 ? `${unread} unread` : "All caught up"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {unread > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<CheckCheck size={14} />}
                  onClick={markAllRead}
                  disabled={deleting}
                >
                  Mark all read
                </Button>
              )}
              {notifs.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<CheckSquare size={14} />}
                  onClick={toggleSelectAll}
                  disabled={deleting}
                >
                  {allSelected ? "Clear selection" : "Select all"}
                </Button>
              )}
              {selectedCount > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<Trash2 size={14} />}
                  onClick={deleteSelected}
                  loading={deleting}
                >
                  Delete selected
                </Button>
              )}
            </div>
          </div>

          {/* ── Loading skeletons ── */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[72px] animate-pulse rounded-2xl bg-(--bg-2)"
                />
              ))}
            </div>
          ) : notifs.length === 0 ? (
            <EmptyState
              icon={<Bell size={32} />}
              title="No notifications"
              description="You're all caught up! New notifications will appear here."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-(--border) bg-(--bg-card)">
              <div className="flex flex-col gap-2 border-b border-(--border) bg-(--bg-2)/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-3 text-[12.5px] font-semibold text-(--text-primary)">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = someSelected;
                    }}
                    onChange={toggleSelectAll}
                    disabled={deleting}
                    className="h-4 w-4 rounded border-(--border) accent-orange-500"
                  />
                  {selectionLabel}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedUnread.length > 0 && (
                    <Button
                      variant="secondary"
                      size="xs"
                      leftIcon={<CheckCheck size={13} />}
                      onClick={async () => {
                        try {
                          await notificationsApi.bulkMarkRead(selectedUnread);
                          setNotifs((prev) => prev.map((n) => selectedIds.has(n.id) ? { ...n, isRead: true } : n));
                          setUnread((count) => Math.max(0, count - selectedUnread.length));
                          showToast.success("Selected notifications marked as read");
                        } catch (err) {
                          handleApiError(err);
                        }
                      }}
                      disabled={deleting}
                    >
                      Mark selected read
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="xs"
                    leftIcon={<Trash2 size={13} />}
                    onClick={deleteSelected}
                    loading={deleting}
                    disabled={selectedCount === 0}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {notifs.map((n, idx) => {
                const { icon, bg } = getConfig(n.type);
                const selected = selectedIds.has(n.id);
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.isRead && markRead(n.id)}
                    className={[
                      "flex items-start gap-3.5 px-5 py-4 transition-colors duration-150",
                      idx < notifs.length - 1 ? "border-b border-(--border)" : "",
                      selected ? "ring-1 ring-inset ring-orange-400/45" : "",
                      n.isRead
                        ? "cursor-default hover:bg-(--bg-2)"
                        : "cursor-pointer bg-orange-500/[0.04] hover:bg-orange-500/[0.08] dark:bg-orange-500/[0.06] dark:hover:bg-orange-500/[0.1]",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelected(n.id)}
                      onClick={(event) => event.stopPropagation()}
                      disabled={deleting}
                      aria-label={`Select ${n.title || "notification"}`}
                      className="mt-3 h-4 w-4 shrink-0 rounded border-(--border) accent-orange-500"
                    />

                    {/* Icon */}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${bg}`}
                    >
                      {icon}
                    </div>

                    {/* Body */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[13.5px] leading-snug ${n.isRead ? "font-medium text-(--text-primary)" : "font-bold text-(--text-primary)"}`}>
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-(--text-muted)">
                          {formatRelative(n.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-(--text-muted)">
                        {n.message}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!n.isRead && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                    )}
                  </div>
                );
              })}
              {totalPages > 1 && (
                <div className="flex flex-col gap-3 border-t border-(--border) bg-(--bg-2)/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-(--text-muted)">
                    Page <span className="font-semibold text-(--text-primary)">{page}</span> of {totalPages} · {total} notifications
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || deleting} className="inline-flex h-8 items-center gap-1 rounded-lg border border-(--border) px-3 text-xs font-semibold text-(--text-primary) transition hover:bg-(--bg-2) disabled:cursor-not-allowed disabled:opacity-40">
                      <ChevronLeft size={13} /> Prev
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
                      const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                      const pageNumber = start + index;
                      return (
                        <button type="button" key={pageNumber} onClick={() => setPage(pageNumber)} disabled={deleting} aria-label={`Go to page ${pageNumber}`} aria-current={pageNumber === page ? "page" : undefined} className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition ${pageNumber === page ? "bg-orange-500 text-white" : "border border-(--border) text-(--text-primary) hover:bg-(--bg-2)"}`}>
                          {pageNumber}
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages || deleting} className="inline-flex h-8 items-center gap-1 rounded-lg border border-(--border) px-3 text-xs font-semibold text-(--text-primary) transition hover:bg-(--bg-2) disabled:cursor-not-allowed disabled:opacity-40">
                      Next <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
