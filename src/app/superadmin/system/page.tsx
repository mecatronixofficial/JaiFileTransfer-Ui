"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Router,
  Server,
  ShieldCheck,
  Signal,
  Sparkles,
  Timer,
  TriangleAlert,
  Wifi,
  XCircle,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { Spinner } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { handleApiError } from "@/lib/error-handler";
import { SystemHealth } from "@/types";

type HealthStatus = "healthy" | "degraded" | "down";
type ServiceStatus = "operational" | "degraded" | "down" | "maintenance";

interface ServiceHealth {
  id: string;
  name: string;
  status: ServiceStatus;
  latencyMs: number;
  uptime: number;
  checkedAt: string;
  message?: string;
}

interface RecentError {
  id: string;
  code: string;
  message: string;
  count: number;
  lastAt: string;
  path?: string;
  service?: string;
}

interface Metrics {
  cpu: number;
  memory: number;
  disk: number;
  dbConnections: number;
  dbMax: number;
  activeRequests: number;
  errorRate: number;
  uptime: number;
  requestsPerMin: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  environment: string;
  region: string;
  version: string;
  nodeVersion: string;
  hostname: string;
  startedAt?: string;
  lastChecked: string;
  status: HealthStatus;
  services: ServiceHealth[];
  recentErrors: RecentError[];
}

const nowIso = () => new Date().toISOString();

const DEFAULT_SERVICES: ServiceHealth[] = [
  { id: "api", name: "API Server", status: "operational", latencyMs: 0, uptime: 0, checkedAt: nowIso(), message: "Awaiting backend probe data" },
  { id: "database", name: "Primary Database", status: "operational", latencyMs: 0, uptime: 0, checkedAt: nowIso(), message: "Connection pool reported by backend" },
  { id: "storage", name: "File Storage", status: "operational", latencyMs: 0, uptime: 0, checkedAt: nowIso(), message: "Storage health not returned yet" },
  { id: "queue", name: "Background Jobs", status: "operational", latencyMs: 0, uptime: 0, checkedAt: nowIso(), message: "Queue health not returned yet" },
  { id: "email", name: "Email Service", status: "operational", latencyMs: 0, uptime: 0, checkedAt: nowIso(), message: "Mail provider health not returned yet" },
  { id: "cache", name: "Cache Layer", status: "operational", latencyMs: 0, uptime: 0, checkedAt: nowIso(), message: "Cache health not returned yet" },
];

const FALLBACK_METRICS: Metrics = {
  cpu: 0,
  memory: 0,
  disk: 0,
  dbConnections: 0,
  dbMax: 100,
  activeRequests: 0,
  errorRate: 0,
  uptime: 0,
  requestsPerMin: 0,
  avgResponseMs: 0,
  p95ResponseMs: 0,
  environment: "production",
  region: "primary",
  version: "current",
  nodeVersion: "unknown",
  hostname: "backend",
  lastChecked: nowIso(),
  status: "healthy",
  services: DEFAULT_SERVICES,
  recentErrors: [],
};

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function statusFromLoad(value: number, warn = 70, danger = 90): HealthStatus {
  if (value >= danger) return "down";
  if (value >= warn) return "degraded";
  return "healthy";
}

function normalizeServiceStatus(value?: string): ServiceStatus {
  if (value === "degraded" || value === "down" || value === "maintenance") return value;
  return "operational";
}

function mapHealth(raw: Partial<SystemHealth>): Metrics {
  const checkedAt = raw.lastChecked ?? nowIso();
  const dbMax = num(raw.dbMaxConnections, 100) || 100;
  const services = raw.services?.length
    ? raw.services.map((service, index) => ({
        id: service.id ?? `${service.name}-${index}`,
        name: service.name,
        status: normalizeServiceStatus(service.status),
        latencyMs: num(service.latencyMs),
        uptime: num(service.uptime),
        checkedAt: service.checkedAt ?? checkedAt,
        message: service.message,
      }))
    : DEFAULT_SERVICES.map((service) => ({ ...service, checkedAt }));

  return {
    cpu: pct(num(raw.cpuUsage)),
    memory: pct(num(raw.memoryUsage)),
    disk: pct(num(raw.diskUsage)),
    dbConnections: num(raw.dbConnections),
    dbMax,
    activeRequests: num(raw.activeRequests),
    errorRate: pct(num(raw.errorRate)),
    uptime: pct(num(raw.uptime)),
    requestsPerMin: num(raw.requestsPerMinute),
    avgResponseMs: num(raw.avgResponseMs),
    p95ResponseMs: num(raw.p95ResponseMs),
    environment: raw.environment ?? "production",
    region: raw.region ?? "primary",
    version: raw.version ?? "current",
    nodeVersion: raw.nodeVersion ?? "unknown",
    hostname: raw.hostname ?? "backend",
    startedAt: raw.startedAt,
    lastChecked: checkedAt,
    status: raw.status ?? "healthy",
    services,
    recentErrors: (raw.recentErrors ?? []).map((error, index) => ({
      id: error.id ?? `${error.code ?? "error"}-${index}`,
      code: String(error.code ?? "ERR"),
      message: error.message,
      count: num(error.count, 1),
      lastAt: error.lastAt ?? checkedAt,
      path: error.path,
      service: error.service,
    })),
  };
}

function statusCopy(status: HealthStatus) {
  if (status === "down") {
    return {
      label: "System Down",
      detail: "Critical backend checks are failing. Review affected services immediately.",
      icon: <XCircle size={24} />,
      cls: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300",
    };
  }
  if (status === "degraded") {
    return {
      label: "Degraded Performance",
      detail: "Some probes are slower or less reliable than expected.",
      icon: <TriangleAlert size={24} />,
      cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300",
    };
  }
  return {
    label: "All Systems Healthy",
    detail: "Core backend checks are passing and no critical incident is active.",
    icon: <CheckCircle2 size={24} />,
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300",
  };
}

function barTone(value: number, warn = 70, danger = 90): string {
  if (value >= danger) return "bg-red-500";
  if (value >= warn) return "bg-amber-500";
  return "bg-emerald-500";
}

function healthText(status: HealthStatus | ServiceStatus): string {
  const map: Record<string, string> = {
    healthy: "Healthy",
    operational: "Operational",
    degraded: "Degraded",
    down: "Down",
    maintenance: "Maintenance",
  };
  return map[status] ?? "Unknown";
}

function statusClasses(status: HealthStatus | ServiceStatus): string {
  const map: Record<string, string> = {
    healthy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    operational: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    degraded: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    maintenance: "bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300",
    down: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300",
  };
  return map[status] ?? map.healthy;
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-950 dark:text-white">{value}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>
        </div>
        <span className={`rounded-lg p-2 ${tone}`}>{icon}</span>
      </div>
    </div>
  );
}

function LoadCard({
  label,
  value,
  icon,
  detail,
  max = 100,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  detail: string;
  max?: number;
}) {
  const percent = pct((value / max) * 100);
  const status = statusFromLoad(percent);

  return (
    <div className="rounded-lg border border-gray-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <span className="text-gray-500 dark:text-gray-400">{icon}</span>
          {label}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusClasses(status)}`}>
          {healthText(status)}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-2xl font-bold text-gray-950 dark:text-white">
          {label === "DB Pool" ? `${value}/${max}` : `${value}%`}
        </p>
        <p className="text-right text-xs text-gray-500 dark:text-gray-400">{detail}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${barTone(percent)} transition-all duration-700`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function SystemHealthPage() {
  const [metrics, setMetrics] = useState<Metrics>(FALLBACK_METRICS);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await adminApi.system({ include: "services,errors,runtime,performance" });
      const raw = (res.data?.data ?? res.data ?? {}) as Partial<SystemHealth>;
      setMetrics(mapHealth(raw));
      setLastRefresh(new Date());
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialId = window.setTimeout(() => {
      void load();
    }, 0);
    const id = window.setInterval(() => load(true), 30_000);
    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(id);
    };
  }, [load]);

  const serviceSummary = useMemo(() => {
    const total = metrics.services.length;
    const healthy = metrics.services.filter((service) => service.status === "operational").length;
    const degraded = metrics.services.filter((service) => service.status === "degraded" || service.status === "maintenance").length;
    const down = metrics.services.filter((service) => service.status === "down").length;
    return { total, healthy, degraded, down };
  }, [metrics.services]);

  const banner = statusCopy(metrics.status);
  const dbPercent = pct((metrics.dbConnections / metrics.dbMax) * 100);

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-6 pb-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-orange-600 dark:text-orange-400">
                <ShieldCheck size={14} />
                Superadmin Control
              </div>
              <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-gray-950 dark:text-white">
                <Server size={28} className="text-orange-500" />
                System Health
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                Live backend status, resource pressure, service probes, and recent incident signals.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-400">
                <span className="font-semibold text-gray-800 dark:text-gray-200">Last checked:</span>{" "}
                {formatRelative(metrics.lastChecked)}
              </div>
              <button
                type="button"
                onClick={() => load()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-gray-200 dark:hover:bg-zinc-800"
              >
                {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>
          </div>

          <section className={`rounded-lg border p-5 shadow-sm ${banner.cls}`}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <span className="mt-0.5">{banner.icon}</span>
                <div>
                  <h2 className="text-lg font-bold">{banner.label}</h2>
                  <p className="mt-1 text-sm opacity-90">{banner.detail}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center sm:min-w-80">
                <div className="rounded-lg bg-white/60 px-3 py-2 dark:bg-black/10">
                  <p className="text-xl font-bold">{serviceSummary.healthy}</p>
                  <p className="text-[11px] font-semibold uppercase opacity-80">Healthy</p>
                </div>
                <div className="rounded-lg bg-white/60 px-3 py-2 dark:bg-black/10">
                  <p className="text-xl font-bold">{serviceSummary.degraded}</p>
                  <p className="text-[11px] font-semibold uppercase opacity-80">Degraded</p>
                </div>
                <div className="rounded-lg bg-white/60 px-3 py-2 dark:bg-black/10">
                  <p className="text-xl font-bold">{serviceSummary.down}</p>
                  <p className="text-[11px] font-semibold uppercase opacity-80">Down</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Uptime"
              value={`${metrics.uptime}%`}
              sub={metrics.startedAt ? `Started ${formatRelative(metrics.startedAt)}` : "Backend reported availability"}
              icon={<Signal size={18} />}
              tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
            />
            <MetricCard
              label="Requests"
              value={metrics.requestsPerMin.toLocaleString()}
              sub={`${metrics.activeRequests.toLocaleString()} active requests`}
              icon={<Activity size={18} />}
              tone="bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
            />
            <MetricCard
              label="Avg Response"
              value={`${metrics.avgResponseMs} ms`}
              sub={`P95 ${metrics.p95ResponseMs} ms`}
              icon={<Timer size={18} />}
              tone="bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
            />
            <MetricCard
              label="Error Rate"
              value={`${metrics.errorRate}%`}
              sub={`${metrics.recentErrors.length} recent error groups`}
              icon={<AlertTriangle size={18} />}
              tone="bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <LoadCard label="CPU" value={metrics.cpu} icon={<Cpu size={16} />} detail="Compute saturation" />
            <LoadCard label="Memory" value={metrics.memory} icon={<MemoryStick size={16} />} detail="Resident usage" />
            <LoadCard label="Disk" value={metrics.disk} icon={<HardDrive size={16} />} detail="Primary volume" />
            <LoadCard label="DB Pool" value={metrics.dbConnections} max={metrics.dbMax} icon={<Database size={16} />} detail={`${dbPercent}% allocated`} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-hidden rounded-lg border border-gray-200/70 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-bold text-gray-950 dark:text-white">Backend Services</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {serviceSummary.healthy} of {serviceSummary.total} probes currently operational
                  </p>
                </div>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-zinc-800 dark:text-gray-300">
                  <Clock3 size={12} />
                  Auto refresh 30s
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-160 text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:bg-zinc-950/30 dark:text-gray-400">
                    <tr>
                      <th className="px-5 py-3 text-left">Service</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Latency</th>
                      <th className="px-4 py-3 text-right">Uptime</th>
                      <th className="px-5 py-3 text-left">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                    {metrics.services.map((service) => (
                      <tr key={service.id} className="hover:bg-gray-50/70 dark:hover:bg-zinc-800/40">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 font-semibold text-gray-950 dark:text-white">
                            <Router size={15} className="text-gray-400" />
                            {service.name}
                          </div>
                          <p className="mt-1 text-xs text-gray-400">{formatRelative(service.checkedAt)}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses(service.status)}`}>
                            {healthText(service.status)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-gray-800 dark:text-gray-200">
                          {service.latencyMs ? `${service.latencyMs} ms` : "-"}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-gray-800 dark:text-gray-200">
                          {service.uptime ? `${service.uptime}%` : "-"}
                        </td>
                        <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                          {service.message ?? "Probe is reporting normally"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-lg border border-gray-200/70 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="font-bold text-gray-950 dark:text-white">Runtime</h2>
                <div className="mt-4 space-y-3 text-sm">
                  {[
                    ["Environment", metrics.environment],
                    ["Region", metrics.region],
                    ["Version", metrics.version],
                    ["Node", metrics.nodeVersion],
                    ["Host", metrics.hostname],
                    ["UI refresh", formatRelative(lastRefresh.toISOString())],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 border-b border-gray-100 pb-2 last:border-0 last:pb-0 dark:border-zinc-800">
                      <span className="text-gray-500 dark:text-gray-400">{label}</span>
                      <span className="max-w-44 truncate text-right font-semibold text-gray-900 dark:text-white">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200/70 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
                  <h2 className="font-bold text-gray-950 dark:text-white">Recent Errors</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Grouped by backend response</p>
                </div>
                <div className="max-h-112 overflow-y-auto">
                  {metrics.recentErrors.length ? (
                    <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                      {metrics.recentErrors.map((error) => (
                        <div key={error.id} className="px-5 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${String(error.code).startsWith("5") ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"}`}>
                              {error.code}
                            </span>
                            <span className="text-xs font-semibold text-gray-400">{error.count}x</span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{error.message}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                            {error.service && <span>{error.service}</span>}
                            {error.path && <span>{error.path}</span>}
                            <span>{formatRelative(error.lastAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-10 text-center">
                      <Sparkles size={24} className="mx-auto text-emerald-500" />
                      <p className="mt-3 font-semibold text-gray-950 dark:text-white">No recent backend errors</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The API did not return active error groups.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-950 dark:text-white">
                <Wifi size={16} className="text-sky-500" />
                API Contract
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Frontend requests service, error, runtime, and performance details from the backend health endpoint.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-950 dark:text-white">
                <Gauge size={16} className="text-violet-500" />
                Thresholds
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Resource pressure turns degraded at 70% and critical at 90% so operators can scan risk quickly.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-950 dark:text-white">
                <Database size={16} className="text-emerald-500" />
                Compatibility
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Existing smaller health payloads still render while newer backend fields fill the full dashboard.
              </p>
            </div>
          </section>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
