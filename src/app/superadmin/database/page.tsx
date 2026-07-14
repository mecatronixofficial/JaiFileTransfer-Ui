"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Database,
  HardDrive,
  RefreshCw,
  Table2,
  Zap,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { Spinner } from "@/components/ui";
import Button from "@/components/ui/Button";
import { adminApi } from "@/lib/api";
import { handleApiError } from "@/lib/error-handler";
import { formatBytes, formatRelative } from "@/lib/utils";

type Tab = "tables" | "queries" | "backups";

interface DatabaseTable {
  name: string;
  rows: number;
  size: number;
  storageSize?: number;
  indexSize?: number;
  indexes: number;
  lastWrite?: string | null;
}

interface SlowQuery {
  id: string;
  query: string;
  durationMs: number;
  calledAt: string;
  table: string;
}

interface BackupRecord {
  id: string;
  name: string;
  size: number;
  status: string;
  createdAt: string;
}

interface DatabaseStats {
  status: "healthy" | "degraded" | "down";
  name?: string;
  host?: string;
  port?: number;
  readyState: number;
  totalSize: number;
  dataSize: number;
  indexSize: number;
  storageSize: number;
  collections: number;
  objects: number;
  avgObjectSize: number;
  connections: number;
  maxConnections: number;
  activeQueries: number;
  slowQueries: number;
  cacheHitRatio: number;
  avgQueryMs: number;
  lastChecked: string;
  tables: DatabaseTable[];
  slowQueryLog: SlowQuery[];
  backups: BackupRecord[];
}

const EMPTY_STATS: DatabaseStats = {
  status: "down",
  readyState: 0,
  totalSize: 0,
  dataSize: 0,
  indexSize: 0,
  storageSize: 0,
  collections: 0,
  objects: 0,
  avgObjectSize: 0,
  connections: 0,
  maxConnections: 100,
  activeQueries: 0,
  slowQueries: 0,
  cacheHitRatio: 0,
  avgQueryMs: 0,
  lastChecked: new Date().toISOString(),
  tables: [],
  slowQueryLog: [],
  backups: [],
};

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapDatabaseStats(raw: Partial<DatabaseStats>): DatabaseStats {
  return {
    ...EMPTY_STATS,
    ...raw,
    status: raw.status ?? (raw.readyState === 1 ? "healthy" : "down"),
    totalSize: num(raw.totalSize),
    dataSize: num(raw.dataSize),
    indexSize: num(raw.indexSize),
    storageSize: num(raw.storageSize),
    collections: num(raw.collections),
    objects: num(raw.objects),
    avgObjectSize: num(raw.avgObjectSize),
    connections: num(raw.connections),
    maxConnections: num(raw.maxConnections, 100) || 100,
    activeQueries: num(raw.activeQueries),
    slowQueries: num(raw.slowQueries),
    cacheHitRatio: num(raw.cacheHitRatio),
    avgQueryMs: num(raw.avgQueryMs),
    lastChecked: raw.lastChecked ?? new Date().toISOString(),
    tables: (raw.tables ?? []).map((table) => ({
      name: table.name,
      rows: num(table.rows),
      size: num(table.size),
      storageSize: num(table.storageSize),
      indexSize: num(table.indexSize),
      indexes: num(table.indexes),
      lastWrite: table.lastWrite ?? null,
    })),
    slowQueryLog: raw.slowQueryLog ?? [],
    backups: raw.backups ?? [],
  };
}

function GaugeBar({ pct, warn = 70, danger = 90 }: { pct: number; warn?: number; danger?: number }) {
  const safePct = Math.max(0, Math.min(100, pct));
  const color = safePct >= danger ? "bg-red-500" : safePct >= warn ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${safePct}%` }} />
    </div>
  );
}

function statusBadge(status: DatabaseStats["status"]) {
  if (status === "down") return "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300";
  if (status === "degraded") return "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300";
}

export default function DatabasePage() {
  const [tab, setTab] = useState<Tab>("tables");
  const [stats, setStats] = useState<DatabaseStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await adminApi.database();
      setStats(mapDatabaseStats(res.data?.data ?? res.data ?? {}));
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

  const connectionPct = Math.min((stats.connections / stats.maxConnections) * 100, 100);
  const storageParts = useMemo(() => {
    const total = stats.totalSize || stats.dataSize + stats.indexSize || 1;
    return {
      data: Math.min((stats.dataSize / total) * 100, 100),
      index: Math.min((stats.indexSize / total) * 100, 100),
    };
  }, [stats.dataSize, stats.indexSize, stats.totalSize]);

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-6 pb-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900 dark:text-white">
                  <Database size={22} className="text-orange-500" /> Database
                </h1>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${statusBadge(stats.status)}`}>
                  {stats.status}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {stats.name ?? "MongoDB"} {stats.host ? `on ${stats.host}` : ""} · Last checked {formatRelative(stats.lastChecked)}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
              className="rounded-xl"
              disabled={loading}
              onClick={() => load()}
            >
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Total Size", value: formatBytes(stats.totalSize), icon: <HardDrive size={18} />, color: "from-blue-500 to-cyan-500" },
              { label: "Collections", value: stats.collections.toLocaleString(), icon: <Table2 size={18} />, color: "from-lime-500 to-emerald-500" },
              { label: "Connections", value: `${stats.connections} / ${stats.maxConnections}`, icon: <Database size={18} />, color: "from-orange-500 to-orange-600" },
              { label: "Objects", value: stats.objects.toLocaleString(), icon: <Activity size={18} />, color: "from-purple-500 to-violet-600" },
            ].map((card) => (
              <div key={card.label} className="rounded-lg border border-gray-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br ${card.color} text-white`}>{card.icon}</div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{card.value}</p>
                <p className="text-xs text-gray-500">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200/70 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-900 dark:text-white">Connections</span>
                <span className="text-gray-500">{stats.connections} / {stats.maxConnections}</span>
              </div>
              <GaugeBar pct={connectionPct} />
              <p className="mt-2 text-xs text-gray-500">{stats.activeQueries} active queries · {stats.slowQueries} slow</p>
            </div>
            <div className="rounded-lg border border-gray-200/70 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 flex items-center justify-between gap-4 text-sm">
                <span className="font-semibold text-gray-900 dark:text-white">Storage</span>
                <span className="truncate text-gray-500">{formatBytes(stats.dataSize)} data · {formatBytes(stats.indexSize)} index</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                <div className="flex h-full">
                  <div className="h-full bg-blue-500" style={{ width: `${storageParts.data}%` }} />
                  <div className="h-full bg-purple-400" style={{ width: `${storageParts.index}%` }} />
                </div>
              </div>
              <div className="mt-2 flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />Data</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-400" />Index</span>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-4 flex w-fit items-center gap-1 rounded-lg border border-gray-200/70 bg-gray-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
              {(["tables", "queries", "backups"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-all ${tab === item ? "bg-white text-orange-600 shadow-sm dark:bg-zinc-800 dark:text-orange-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}
                >
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>

            {tab === "tables" && (
              <div className="overflow-hidden rounded-lg border border-gray-200/70 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-180 text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Collection</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Rows</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Data</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Storage</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Index</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Indexes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                      {stats.tables.length ? stats.tables.map((table) => (
                        <tr key={table.name} className="hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <Table2 size={14} className="text-gray-400" />
                              <span className="font-mono font-semibold text-gray-900 dark:text-white">{table.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">{table.rows.toLocaleString()}</td>
                          <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">{formatBytes(table.size)}</td>
                          <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">{formatBytes(table.storageSize ?? 0)}</td>
                          <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">{formatBytes(table.indexSize ?? 0)}</td>
                          <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">{table.indexes}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">No collection stats returned by the backend.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === "queries" && (
              <div className="space-y-3">
                {stats.slowQueryLog.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800/40 dark:bg-emerald-900/10">
                    <CheckCircle size={18} className="text-emerald-500" />
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">No slow queries returned by the backend</p>
                  </div>
                ) : (
                  stats.slowQueryLog.map((query) => (
                    <div key={query.id} className="rounded-lg border border-yellow-200 bg-yellow-50/60 p-5 dark:border-yellow-800/30 dark:bg-yellow-900/10">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className="text-yellow-600 dark:text-yellow-400" />
                          <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">Slow Query · {query.durationMs}ms</span>
                        </div>
                        <span className="text-xs text-gray-500">{formatRelative(query.calledAt)}</span>
                      </div>
                      <p className="break-all font-mono text-xs text-gray-700 dark:text-gray-300">{query.query}</p>
                      <p className="mt-1.5 text-xs text-gray-500">Collection: <span className="font-medium">{query.table}</span></p>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "backups" && (
              <div className="overflow-hidden rounded-lg border border-gray-200/70 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                {stats.backups.length ? (
                  <div className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                    {stats.backups.map((backup) => (
                      <div key={backup.id} className="flex items-center justify-between px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/20">
                            <Database size={16} />
                          </div>
                          <div>
                            <p className="font-mono text-sm font-medium text-gray-900 dark:text-white">{backup.name}</p>
                            <p className="text-xs text-gray-500">{formatBytes(backup.size)} · {formatRelative(backup.createdAt)}</p>
                          </div>
                        </div>
                        <span className="flex items-center gap-1.5 text-xs font-semibold capitalize text-emerald-600 dark:text-emerald-400">
                          <CheckCircle size={12} /> {backup.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-6 py-10 text-center">
                    <Zap size={22} className="mx-auto text-orange-500" />
                    <p className="mt-3 font-semibold text-gray-900 dark:text-white">No backup records returned</p>
                    <p className="mt-1 text-xs text-gray-500">Connect your backup provider to show backup history here.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
