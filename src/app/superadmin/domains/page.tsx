"use client";

import { useState } from "react";
import {
  Globe, Plus, CheckCircle, XCircle, Clock, Copy, Check,
  Trash2, RefreshCw, Shield, AlertTriangle, MoreHorizontal,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { formatRelative } from "@/lib/utils";
import Button from "@/components/ui/Button";

interface Domain {
  id: string; domain: string; type: "primary" | "alias" | "custom";
  status: "active" | "pending" | "failed";
  ssl: "valid" | "expired" | "pending";
  sslExpiry?: string; verified: boolean;
  addedAt: string; usedBy?: number;
}

const MOCK: Domain[] = [
  { id: "d1", domain: "jaiex.app",         type: "primary", status: "active",  ssl: "valid",   sslExpiry: "2027-05-01T00:00:00Z", verified: true, addedAt: "2026-01-01T00:00:00Z", usedBy: 1_847 },
  { id: "d2", domain: "www.jaiex.app",     type: "alias",   status: "active",  ssl: "valid",   sslExpiry: "2027-05-01T00:00:00Z", verified: true, addedAt: "2026-01-01T00:00:00Z", usedBy: 1_847 },
  { id: "d3", domain: "files.jaiex.app",   type: "alias",   status: "active",  ssl: "valid",   sslExpiry: "2027-05-01T00:00:00Z", verified: true, addedAt: "2026-02-10T00:00:00Z", usedBy: 1_847 },
  { id: "d4", domain: "api.jaiex.app",     type: "alias",   status: "active",  ssl: "valid",   sslExpiry: "2027-05-01T00:00:00Z", verified: true, addedAt: "2026-01-01T00:00:00Z", usedBy: undefined },
  { id: "d5", domain: "jaiindia.com",      type: "custom",  status: "active",  ssl: "valid",   sslExpiry: "2026-11-15T00:00:00Z", verified: true, addedAt: "2026-03-15T00:00:00Z", usedBy: 214 },
  { id: "d6", domain: "transfers.jai.co",  type: "custom",  status: "pending", ssl: "pending", verified: false, addedAt: "2026-05-28T00:00:00Z", usedBy: undefined },
  { id: "d7", domain: "share.oldclient.io",type: "custom",  status: "failed",  ssl: "expired", sslExpiry: "2026-03-01T00:00:00Z", verified: false, addedAt: "2026-01-20T00:00:00Z", usedBy: 0 },
];

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; icon: React.ReactNode }> = {
    active:  { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: <CheckCircle size={10} /> },
    pending: { cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",     icon: <Clock size={10} /> },
    failed:  { cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",                 icon: <XCircle size={10} /> },
  };
  const s = cfg[status] ?? cfg.pending;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.icon}{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

function SSLBadge({ ssl, expiry }: { ssl: string; expiry?: string }) {
  if (ssl === "valid") {
    const days = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000) : null;
    const urgent = days !== null && days < 30;
    return (
      <div className="flex items-center gap-1">
        <Shield size={12} className={urgent ? "text-yellow-500" : "text-emerald-500"} />
        <span className={`text-xs ${urgent ? "text-yellow-600 dark:text-yellow-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {days !== null ? `${days}d left` : "Valid"}
        </span>
      </div>
    );
  }
  if (ssl === "expired") return <span className="flex items-center gap-1 text-xs text-red-500"><XCircle size={12} />Expired</span>;
  return <span className="flex items-center gap-1 text-xs text-gray-400"><Clock size={12} />Pending</span>;
}

export default function DomainsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [copiedId, setCopied] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const handleCopy = (id: string, txt: string) => {
    navigator.clipboard.writeText(txt).catch(() => null);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const VERIFICATION_RECORD = "_jai-verify.example.com  TXT  jai-verify=abc123xyz456";

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-6 pb-10">

          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900 dark:text-white">
                <Globe size={22} className="text-orange-500" /> Domain Manager
              </h1>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Manage custom domains and SSL certificates</p>
            </div>
            <Button leftIcon={<Plus size={15} />} onClick={() => setShowAddForm(!showAddForm)} className="rounded-xl">
              Add Domain
            </Button>
          </div>

          {/* Add domain form */}
          {showAddForm && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5 dark:border-orange-800/40 dark:bg-orange-900/10">
              <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">Add Custom Domain</h3>
              <div className="flex flex-col gap-3">
                <input type="text" placeholder="yourdomain.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
                <Button className="rounded-xl">Verify</Button>
                <Button variant="secondary" className="rounded-xl" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Add this DNS TXT record to verify ownership:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-800 dark:bg-zinc-800 dark:text-gray-200">
                    {VERIFICATION_RECORD}
                  </code>
                  <button type="button" onClick={() => handleCopy("dns", VERIFICATION_RECORD)}
                    className="shrink-0 text-gray-400 hover:text-orange-500">
                    {copiedId === "dns" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Domains",  value: MOCK.length,                                    color: "text-orange-500" },
              { label: "Active",         value: MOCK.filter((d) => d.status === "active").length, color: "text-emerald-500" },
              { label: "SSL Valid",      value: MOCK.filter((d) => d.ssl === "valid").length,    color: "text-blue-500" },
              { label: "Pending",        value: MOCK.filter((d) => d.status === "pending").length, color: "text-yellow-500" },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-gray-200/70 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Domain table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <tr>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Domain</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">SSL</th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Users</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Added</th>
                    <th className="px-4 py-3.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/70">
                  {MOCK.map((d) => (
                    <tr key={d.id} className="transition-colors hover:bg-gray-50/60 dark:hover:bg-zinc-800/30">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Globe size={14} className="text-gray-400" />
                          <span className="font-mono font-semibold text-gray-900 dark:text-white">{d.domain}</span>
                          {d.type === "primary" && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">PRIMARY</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-xs capitalize text-gray-500">{d.type}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center"><StatusBadge status={d.status} /></td>
                      <td className="px-4 py-3.5 text-center"><SSLBadge ssl={d.ssl} expiry={d.sslExpiry} /></td>
                      <td className="px-4 py-3.5 text-right text-sm text-gray-600 dark:text-gray-400">
                        {d.usedBy != null ? d.usedBy.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{formatRelative(d.addedAt)}</td>
                      <td className="px-4 py-3.5">
                        {d.type !== "primary" && (
                          <div className="relative">
                            <button type="button" onClick={() => setMenuOpen(menuOpen === d.id ? null : d.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800">
                              <MoreHorizontal size={14} />
                            </button>
                            {menuOpen === d.id && (
                              <div className="absolute right-0 top-9 z-20 min-w-[150px] rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                                {d.status === "pending" && (
                                  <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800">
                                    <RefreshCw size={13} />Re-verify
                                  </button>
                                )}
                                {d.ssl !== "valid" && (
                                  <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-zinc-800">
                                    <Shield size={13} />Renew SSL
                                  </button>
                                )}
                                <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />
                                <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                                  <Trash2 size={13} />Remove
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SSL warning */}
          {MOCK.some((d) => d.ssl === "expired") && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-800/40 dark:bg-red-900/10">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">SSL Certificate Expired</p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  {MOCK.filter((d) => d.ssl === "expired").map((d) => d.domain).join(", ")} — Renew immediately to restore HTTPS.
                </p>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
