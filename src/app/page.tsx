import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  FileText,
  FolderLock,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import ImgHelper from "@/helper/img_helper";

const features = [
  {
    title: "Secure storage",
    description: "Protect important files with encrypted cloud storage.",
    icon: FolderLock,
    color: "bg-green-50 text-[rgb(73,140,1)]",
  },
  {
    title: "Fast transfers",
    description: "Send large files quickly without complicated steps.",
    icon: Zap,
    color: "bg-orange-50 text-orange-600",
  },
  {
    title: "Team sharing",
    description: "Share files securely with employees, clients, and teams.",
    icon: Users,
    color: "bg-lime-50 text-lime-700",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-[#f7faf3] px-2.5 py-2.5 text-slate-900 sm:px-6 sm:py-4 lg:px-9">
      <div className="pointer-events-none fixed inset-0">
        <Image
          src={ImgHelper.home.background}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[58%_center] sm:object-center"
        />
        <div className="absolute inset-0 bg-white/60 lg:bg-gradient-to-r lg:from-white/90 lg:via-[#f7faef]/55 lg:to-white/20" />
        <div className="absolute -left-24 top-20 h-80 w-80 rounded-full bg-[rgb(73,140,1)]/10 blur-3xl" />
        <div className="absolute -right-20 bottom-10 h-96 w-96 rounded-full bg-orange-400/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <header className="flex min-h-16 items-center justify-between gap-2 rounded-2xl border border-white/80 bg-white/80 px-2.5 py-2 shadow-lg shadow-green-950/5 backdrop-blur-xl sm:min-h-[68px] sm:gap-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 sm:h-11 sm:w-11">
              <Image
                src={ImgHelper.logo.jai_logo}
                alt="Jai Export Enterprises"
                width={34}
                height={34}
                className="h-7 w-7 object-contain sm:h-8 sm:w-8"
              />
            </span>
            <span className="min-w-0">
              <span className="block max-w-28 truncate text-xs font-extrabold tracking-tight text-slate-900 sm:max-w-none sm:text-lg">
                Jai Export Enterprises
              </span>
              <span className="hidden text-xs font-medium text-slate-500 sm:block">
                Secure File Transfer
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="hidden rounded-full border border-[rgb(73,140,1)]/25 bg-white px-5 py-2.5 text-sm font-bold text-[rgb(62,120,1)] transition hover:bg-green-50 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[rgb(73,140,1)] px-3 py-2.5 text-xs font-bold text-white shadow-lg shadow-green-700/15 transition hover:-translate-y-0.5 hover:bg-[rgb(62,120,1)] sm:gap-2 sm:rounded-full sm:px-5 sm:text-sm"
            >
              <span className="sm:hidden">Open</span>
              <span className="hidden sm:inline">Access workspace</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <section className="grid min-h-[calc(100dvh-74px)] items-center gap-6 py-4 sm:min-h-[calc(100dvh-84px)] sm:py-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-7 lg:py-8 xl:gap-10">
          <div className="relative rounded-3xl border border-white/90 bg-white/78 p-4 shadow-2xl shadow-green-950/10 backdrop-blur-xl sm:p-7 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            <span className="absolute left-5 top-0 h-1 w-20 -translate-y-1/2 rounded-full bg-gradient-to-r from-[rgb(73,140,1)] to-orange-500 lg:hidden" />
            <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-[rgb(73,140,1)]/20 bg-white/85 px-3 py-2 text-xs font-semibold text-[rgb(62,120,1)] shadow-sm backdrop-blur sm:px-4 sm:text-sm">
              <Sparkles className="h-4 w-4 text-orange-500" />
              File Transfer Service
            </div>

            <h1 className="max-w-3xl text-4xl font-black leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-5xl xl:text-6xl 2xl:text-7xl">
              Jai Export
              <span className="block bg-gradient-to-r from-[rgb(73,140,1)] via-lime-600 to-orange-500 bg-clip-text text-transparent">
                Enterprises
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
              Easily share and transfer files over the internet with convenience.
              {" "}Enjoy extensive customization options and robust tracking capabilities.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="group inline-flex w-full items-center justify-center gap-3 rounded-xl bg-[rgb(73,140,1)] px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-green-700/20 transition hover:-translate-y-0.5 hover:bg-[rgb(62,120,1)] sm:w-auto sm:rounded-full"
              >
                Start transferring
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <Link
                href="#features"
                className="hidden items-center justify-center rounded-full border border-orange-200 bg-white/90 px-6 py-3.5 text-sm font-bold text-orange-600 shadow-sm backdrop-blur transition hover:bg-orange-50 xl:inline-flex"
              >
                Explore features
              </Link>
            </div>

            <div className="mt-6 hidden flex-wrap gap-x-7 gap-y-3 text-sm font-medium text-slate-600 sm:flex">
              {["Secure cloud storage", "Role-based access", "Audit tracking"].map(
                (item) => (
                  <span key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[rgb(73,140,1)]" />
                    {item}
                  </span>
                ),
              )}
            </div>

            <div id="features" className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 xl:mt-7 xl:gap-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="grid min-w-0 grid-cols-[auto_1fr] items-center gap-3 rounded-xl border border-white bg-white/80 p-3 text-left shadow-sm backdrop-blur transition hover:-translate-y-1 hover:border-[rgb(73,140,1)]/20 hover:shadow-lg sm:block sm:text-center xl:rounded-2xl xl:p-4 xl:text-left"
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:mx-auto sm:mb-2 xl:mx-0 xl:mb-3 xl:rounded-xl ${feature.color}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-slate-900 sm:truncate sm:text-xs xl:text-base">{feature.title}</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-500 sm:hidden xl:block xl:text-sm xl:leading-6">
                        {feature.description}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="relative mx-auto hidden w-full max-w-xl lg:block">
            <div className="absolute -inset-5 rounded-[2.75rem] bg-gradient-to-br from-[rgb(73,140,1)]/20 to-orange-400/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white bg-white/86 p-4 shadow-2xl shadow-green-900/10 backdrop-blur-xl xl:p-6">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[rgb(73,140,1)] via-lime-500 to-orange-500" />
              <div className="flex items-center justify-between border-b border-slate-200 pb-5">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-orange-400" />
                  <span className="h-3 w-3 rounded-full bg-lime-400" />
                  <span className="h-3 w-3 rounded-full bg-[rgb(73,140,1)]" />
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[rgb(62,120,1)]">
                  <ShieldCheck className="h-4 w-4" />
                  Secure session
                </div>
              </div>

              <div className="mt-5 rounded-[1.75rem] border-2 border-dashed border-[rgb(73,140,1)]/30 bg-green-50/75 px-4 py-6 text-center xl:px-6 xl:py-8">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[rgb(73,140,1)] to-lime-600 shadow-xl shadow-green-700/20 xl:h-20 xl:w-20 xl:rounded-3xl">
                  <CloudUpload className="h-8 w-8 text-white xl:h-10 xl:w-10" />
                </div>
                <h2 className="mt-4 text-xl font-extrabold text-slate-900 xl:text-2xl">
                  Drop your files here
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  Documents, images, videos, and folders are protected from upload to delivery.
                </p>
                <Link
                  href="/login"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
                >
                  Browse files
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                    <FileText className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-bold text-slate-800">Company_Profile.pdf</p>
                      <p className="shrink-0 text-xs text-slate-500">8.2 MB</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-[rgb(73,140,1)] to-lime-500" />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-[rgb(73,140,1)]">Uploading 82%</span>
                      <span className="text-slate-400">4 seconds left</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                {[
                  ["Files", "1,248"],
                  ["Storage", "68%"],
                  ["Shared", "326"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-[#f7faf3] p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 text-lg font-extrabold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute -bottom-7 -left-3 hidden items-center gap-3 rounded-2xl border border-green-100 bg-white/95 px-4 py-3 shadow-xl backdrop-blur sm:flex">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-[rgb(73,140,1)]">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-900">Protected transfer</span>
                <span className="block text-xs text-slate-500">Encryption enabled</span>
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
