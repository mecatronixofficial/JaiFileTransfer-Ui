"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  FolderUp,
  Gauge,
  HelpCircle,
  RefreshCw,
  SearchX,
  ShieldAlert,
} from "lucide-react";

type ErrorScreenProps = {
  statusCode: "404" | "500";
  title: string;
  description: string;
  digest?: string;
  onRetry?: () => void;
};

const relatedPages = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Return to your file overview",
    icon: Gauge,
  },
  {
    href: "/transfers/send",
    label: "Send files",
    description: "Start a secure transfer",
    icon: FolderUp,
  },
  {
    href: "/help",
    label: "Help center",
    description: "Find answers and support",
    icon: HelpCircle,
  },
];

export default function ErrorScreen({
  statusCode,
  title,
  description,
  digest,
  onRetry,
}: ErrorScreenProps) {
  const isNotFound = statusCode === "404";
  const StatusIcon = isNotFound ? SearchX : ShieldAlert;

  return (
    <main className="relative min-h-dvh overflow-hidden bg-white px-5 py-6 text-slate-950 sm:px-8 lg:px-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(73,140,1,0.12),transparent_30%),radial-gradient(circle_at_85%_80%,rgba(252,170,1,0.16),transparent_34%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] [background-size:36px_36px]"
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/login"
            aria-label="Jai Export Enterprises home"
            className="inline-flex min-w-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[rgb(73,140,1)]/40"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <Image
                src="/logo/jai-logo.png"
                alt=""
                aria-hidden="true"
                width={50}
                height={34}
                className="h-auto w-full object-contain"
              />
            </span>
            <span className="min-w-0">
              <span className="company-name block truncate text-sm font-bold uppercase tracking-[0.11em] text-slate-950 sm:text-base">
                Jai Export Enterprises
              </span>
              <span className="block text-xs font-semibold text-[rgb(62,120,1)] sm:text-sm">
                File Transfer Service
              </span>
            </span>
          </Link>

          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold tracking-[0.18em] text-slate-500 shadow-sm backdrop-blur">
            ERROR {statusCode}
          </span>
        </header>

        <section className="flex flex-1 items-center py-10 sm:py-14">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] lg:gap-16">
            <div className="text-center lg:text-left">
              <div className="relative mx-auto inline-flex lg:mx-0">
                <span
                  aria-hidden="true"
                  className="company-name bg-gradient-to-br from-[rgb(73,140,1)] via-lime-600 to-orange-400 bg-clip-text text-[7rem] font-bold leading-none tracking-[-0.08em] text-transparent sm:text-[10rem]"
                >
                  {statusCode}
                </span>
                <span className="absolute -right-3 top-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white shadow-xl shadow-slate-200/70 sm:h-14 sm:w-14">
                  <StatusIcon
                    aria-hidden="true"
                    className={`h-6 w-6 sm:h-7 sm:w-7 ${isNotFound ? "text-[rgb(73,140,1)]" : "text-orange-500"}`}
                  />
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                {title}
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7 lg:mx-0">
                {description}
              </p>

              {digest && (
                <p className="mt-3 text-xs font-medium text-slate-400">
                  Reference: {digest}
                </p>
              )}

              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                  >
                    <RefreshCw aria-hidden="true" className="h-4 w-4" />
                    Try again
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                  >
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    Back to home
                  </Link>
                )}

                {onRetry && (
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                  >
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    Back to home
                  </Link>
                )}
              </div>
            </div>

            <aside className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-2xl shadow-slate-200/60 backdrop-blur-xl sm:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                Useful destinations
              </p>
              <div className="mt-4 space-y-3">
                {relatedPages.map((page) => {
                  const Icon = page.icon;
                  return (
                    <Link
                      key={page.href}
                      href={page.href}
                      className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 transition group-hover:bg-orange-500 group-hover:text-white">
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900">
                          {page.label}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {page.description}
                        </span>
                      </span>
                      <ArrowLeft
                        aria-hidden="true"
                        className="ml-auto h-4 w-4 rotate-180 text-slate-300 transition group-hover:translate-x-1 group-hover:text-orange-500"
                      />
                    </Link>
                  );
                })}
              </div>
            </aside>
          </div>
        </section>

        <footer className="text-center text-xs text-slate-400 sm:text-left">
          Secure file sharing by Jai Export Enterprises
        </footer>
      </div>
    </main>
  );
}
