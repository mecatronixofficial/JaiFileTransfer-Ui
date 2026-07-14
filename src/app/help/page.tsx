"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Send,
  Inbox,
  Link2,
  QrCode,
  Eye,
  Shield,
  ArrowRight,
  Search,
  Sparkles,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import Button from "@/components/ui/Button";

const TOPICS = [
  {
    icon: <Send size={22} className="text-orange-500" />,
    bg: "bg-orange-50 dark:bg-orange-900/20",
    title: "Sending a transfer",
    desc: "How to share files with anyone",
    href: "#sending",
  },
  {
    icon: <Inbox size={22} className="text-blue-500" />,
    bg: "bg-blue-50 dark:bg-blue-900/20",
    title: "Receiving transfers",
    desc: "Download files sent to you",
    href: "#receiving",
  },
  {
    icon: <Link2 size={22} className="text-purple-500" />,
    bg: "bg-purple-50 dark:bg-purple-900/20",
    title: "Share links",
    desc: "Generate public download URLs",
    href: "#links",
  },
  {
    icon: <QrCode size={22} className="text-pink-500" />,
    bg: "bg-pink-50 dark:bg-pink-900/20",
    title: "QR codes",
    desc: "Print or post QR codes anywhere",
    href: "#qr",
  },
  {
    icon: <Eye size={22} className="text-green-500" />,
    bg: "bg-green-50 dark:bg-green-900/20",
    title: "Tracking views",
    desc: "See who viewed or downloaded",
    href: "#tracking",
  },
  {
    icon: <Shield size={22} className="text-amber-500" />,
    bg: "bg-amber-50 dark:bg-amber-900/20",
    title: "Security & privacy",
    desc: "How we protect your transfers",
    href: "#security",
  },
];

export default function HelpPage() {
  const [query, setQuery] = useState("");

  const filtered = TOPICS.filter(
    (t) =>
      query.trim() === "" ||
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.desc.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in space-y-10 pb-12">
          {/* ── HERO ── */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-amber-400 px-8 py-12 text-white shadow-xl shadow-orange-500/20">
            {/* Background circles */}
            <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-white/10" />
            <div className="absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-white/10" />

            <div className="relative z-10 max-w-2xl">
              <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium backdrop-blur-sm">
                <Sparkles size={14} />
                Help Center
              </span>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                How can we help?
              </h1>
              <p className="mt-3 text-base text-white/80">
                Find answers about sending, receiving, and tracking your file transfers.
              </p>

              {/* Search */}
              <div className="mt-6 flex items-center gap-3 rounded-xl bg-white/20 px-4 py-3 backdrop-blur-sm ring-1 ring-white/30 focus-within:ring-white/60 transition-all">
                <Search size={18} className="shrink-0 text-white/70" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search... try 'send', 'QR code', or 'expired'"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/60 outline-none"
                />
              </div>
            </div>
          </div>

          {/* ── TOPICS ── */}
          <div>
            <h2 className="mb-5 text-lg font-semibold text-gray-900 dark:text-white">
              Browse topics
            </h2>

            {filtered.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No topics match &ldquo;{query}&rdquo;.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((topic) => (
                  <a
                    key={topic.title}
                    href={topic.href}
                    className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-orange-700"
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${topic.bg}`}
                    >
                      {topic.icon}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 group-hover:text-orange-500 dark:text-white transition-colors">
                        {topic.title}
                      </h3>
                      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        {topic.desc}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* ── CTA ── */}
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-orange-200 bg-orange-50/60 px-6 py-5 dark:border-orange-900/50 dark:bg-orange-900/10 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-500 dark:bg-orange-900/40">
                <Sparkles size={20} />
              </span>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  New here? Start your first transfer
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Send files via email or generate a shareable link in 30 seconds.
                </p>
              </div>
            </div>
            <Link href="/transfers/send">
              <Button rightIcon={<ArrowRight size={16} />} className="shrink-0">
                Start Sending
              </Button>
            </Link>
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
