"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  User,
} from "lucide-react";

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */

type FormData = {
  name: string;
  email: string;
  company: string;
  phone: string;
  subject: string;
  message: string;
};

type FormErrors = Partial<FormData>;

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const SUBJECTS = [
  "General enquiry",
  "Enterprise pricing",
  "Request a demo",
  "Technical support",
  "Partnership opportunity",
  "Other",
];

const CONTACT_CARDS = [
  {
    Icon: Mail,
    title: "Email us",
    detail: "hello@jai-india.com",
    sub: "We reply within 24 hours",
    href: "mailto:hello@jai-india.com",
  },
  {
    Icon: Phone,
    title: "Call us",
    detail: "+91 98765 43210",
    sub: "Mon – Fri, 9 am – 6 pm IST",
    href: "tel:+919876543210",
  },
  {
    Icon: MapPin,
    title: "Office",
    detail: "Mumbai, Maharashtra",
    sub: "India — 400001",
    href: "#",
  },
];

/* ─────────────────────────────────────────────
   FIELD COMPONENT
───────────────────────────────────────────── */

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-orange-500">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-red-500">
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            !
          </span>
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass = (hasError: boolean) =>
  `w-full rounded-2xl border-2 bg-white px-4 py-3 text-sm text-gray-900 outline-none
   placeholder:text-gray-400 transition-all duration-200 shadow-sm dark:bg-zinc-900 dark:text-white dark:placeholder:text-gray-500
   focus:ring-4
   ${
     hasError
       ? "border-red-400 focus:border-red-500 focus:ring-red-500/12 dark:border-red-500"
       : "border-gray-200 hover:border-orange-300 focus:border-orange-500 focus:ring-orange-500/12 dark:border-zinc-700 dark:hover:border-orange-700"
   }`;

/* ─────────────────────────────────────────────
   PAGE
───────────────────────────────────────────── */

export default function ContactPage() {
  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    company: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate(): boolean {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = "Full name is required";
    if (!form.email.trim()) e.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Enter a valid email address";
    if (!form.subject) e.subject = "Please select a subject";
    if (!form.message.trim()) e.message = "Message is required";
    else if (form.message.trim().length < 20)
      e.message = "Please write at least 20 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1600));
    setSubmitting(false);
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-zinc-950 dark:text-white">
      {/* ══════════════════════════════════════
          HERO HEADER
      ══════════════════════════════════════ */}
      <div className="relative overflow-hidden bg-linear-to-br from-orange-600 via-orange-500 to-amber-400">
        <div className="grid-overlay-lg absolute inset-0 opacity-[0.06]" />
        <div className="pointer-events-none absolute -top-32 -left-32 h-120 w-120 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-6xl px-6 py-14 md:py-20">
          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/30"
          >
            <ArrowLeft size={14} />
            Back to home
          </Link>

          {/* Badge + title + subtitle */}
          <div className="mt-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-white ring-1 ring-white/30 backdrop-blur-sm">
              <MessageSquare size={12} />
              Contact us
            </div>
            <h1 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-tight text-white">
              Get in touch
            </h1>
            <p className="mt-3 max-w-md text-base leading-relaxed text-white/70">
              Have a question or ready to get started? Fill in the form and our
              team will respond within one business day.
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          CONTACT CARDS
      ══════════════════════════════════════ */}
      <div className="bg-orange-50 dark:bg-zinc-950">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-6 py-10 sm:grid-cols-3">
          {CONTACT_CARDS.map(({ Icon, title, detail, sub, href }) => (
            <a
              key={title}
              href={href}
              className="group flex items-start gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-orange-100 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-500/10 hover:ring-orange-300 dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:ring-orange-700"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 shadow-md shadow-orange-500/30 transition-transform duration-300 group-hover:scale-110">
                <Icon size={18} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
                  {title}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {detail}
                </p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════
          ENQUIRY FORM
      ══════════════════════════════════════ */}
      <div className="bg-orange-50 px-6 pb-20 dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl">
          {submitted ? (
            /* ── Success state ── */
            <div className="animate-fade-in rounded-3xl bg-white p-12 text-center shadow-xl shadow-gray-200/80 ring-1 ring-gray-100 dark:bg-zinc-900 dark:shadow-none dark:ring-zinc-800">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-xl shadow-emerald-500/30">
                <CheckCircle2 size={36} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Enquiry sent!
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-gray-500 dark:text-gray-400">
                Thanks,{" "}
                <strong className="text-gray-700 dark:text-gray-200">
                  {form.name.split(" ")[0]}
                </strong>
                ! We&apos;ve received your message and will reply to{" "}
                <strong className="text-gray-700 dark:text-gray-200">{form.email}</strong> within
                one business day.
              </p>

              <div className="mx-auto mt-8 max-w-sm rounded-2xl bg-gray-50 px-6 py-5 text-left ring-1 ring-gray-200 space-y-3 dark:bg-zinc-800/70 dark:ring-zinc-700">
                {[
                  { label: "Subject", value: form.subject },
                  { label: "Company", value: form.company || "—" },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {label}
                    </span>
                    <span className="text-right text-sm font-medium text-gray-700 dark:text-gray-200">
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5"
                >
                  Back to home <ArrowRight size={15} />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setForm({
                      name: "",
                      email: "",
                      company: "",
                      phone: "",
                      subject: "",
                      message: "",
                    });
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 px-6 py-3 text-sm font-semibold text-gray-600 transition hover:border-orange-300 hover:text-orange-600 dark:border-zinc-700 dark:text-gray-300 dark:hover:border-orange-600 dark:hover:text-orange-400"
                >
                  Send another
                </button>
              </div>
            </div>
          ) : (
            /* ── Form ── */
            <form
              onSubmit={handleSubmit}
              noValidate
              className="animate-fade-in rounded-3xl bg-white p-8 shadow-xl shadow-gray-200/80 ring-1 ring-gray-100 dark:bg-zinc-900 dark:shadow-none dark:ring-zinc-800 lg:p-14"
            >
              <div className="mb-8 flex items-center gap-3 border-b border-gray-100 pb-7 dark:border-zinc-800">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 shadow-md shadow-orange-500/30">
                  <Send size={17} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Send an enquiry
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Fields marked{" "}
                    <span className="font-semibold text-orange-500">*</span> are
                    required.
                  </p>
                </div>
              </div>

              {/* Row 1: Name + Email */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Full name" error={errors.name} required>
                  <div className="relative">
                    <User
                      size={15}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="John Smith"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      autoComplete="name"
                      className={`${inputClass(!!errors.name)} pl-10`}
                    />
                  </div>
                </Field>

                <Field label="Email address" error={errors.email} required>
                  <div className="relative">
                    <Mail
                      size={15}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="email"
                      placeholder="you@company.com"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      autoComplete="email"
                      className={`${inputClass(!!errors.email)} pl-10`}
                    />
                  </div>
                </Field>
              </div>

              {/* Row 2: Company + Phone */}
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Company" error={errors.company}>
                  <div className="relative">
                    <Building2
                      size={15}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="Acme Corp (optional)"
                      value={form.company}
                      onChange={(e) => set("company", e.target.value)}
                      autoComplete="organization"
                      className={`${inputClass(!!errors.company)} pl-10`}
                    />
                  </div>
                </Field>

                <Field label="Phone number" error={errors.phone}>
                  <div className="relative">
                    <Phone
                      size={15}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="tel"
                      placeholder="+91 98765 43210 (optional)"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      autoComplete="tel"
                      className={`${inputClass(!!errors.phone)} pl-10`}
                    />
                  </div>
                </Field>
              </div>

              {/* Row 3: Subject */}
              <div className="mt-5">
                <Field label="Subject" error={errors.subject} required>
                  <div className="relative">
                    <MessageSquare
                      size={15}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <select
                      value={form.subject}
                      onChange={(e) => set("subject", e.target.value)}
                      className={`${inputClass(!!errors.subject)} cursor-pointer appearance-none pl-10 pr-10`}
                    >
                      <option value="" disabled>
                        Select a subject…
                      </option>
                      {SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <svg
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </Field>
              </div>

              {/* Row 4: Message */}
              <div className="mt-5">
                <Field label="Message" error={errors.message} required>
                  <div className="relative">
                    <textarea
                      rows={5}
                      placeholder="Tell us about your needs, timeline, or any questions you have…"
                      value={form.message}
                      onChange={(e) => set("message", e.target.value)}
                      className={`${inputClass(!!errors.message)} resize-none py-3.5`}
                    />
                    <span className="absolute bottom-3 right-4 text-xs tabular-nums text-gray-300 dark:text-gray-600">
                      {form.message.length}
                    </span>
                  </div>
                </Field>
              </div>

              {/* Privacy note */}
              <p className="mt-4 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
                By submitting this form you agree to our{" "}
                <Link
                  href="/privacy"
                  className="font-semibold text-orange-500 hover:underline"
                >
                  Privacy Policy
                </Link>
                . We&apos;ll never share your information with third parties.
              </p>

              {/* Submit */}
              <div className="mt-7">
                <button
                  type="submit"
                  disabled={submitting}
                  className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-orange-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-500/35 disabled:pointer-events-none disabled:opacity-70"
                >
                  <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
                  <span className="relative flex items-center gap-2.5">
                    {submitting ? (
                      <>
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Sending your enquiry…
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Send Enquiry
                      </>
                    )}
                  </span>
                </button>
              </div>

              {/* Response time badge */}
              <div className="mt-5 flex items-center justify-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                  Average response time:{" "}
                  <strong className="text-gray-600 dark:text-gray-300">under 24 hours</strong>
                </span>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════
          FOOTER STRIP
      ══════════════════════════════════════ */}
      <div className="bg-orange-600 px-6 py-6 text-center text-sm text-white/70">
        © 2026 Jai Export Enterprises ·{" "}
        <Link href="/privacy" className="transition hover:text-white">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" className="transition hover:text-white">
          Terms
        </Link>
        {" · "}
        <Link href="/" className="transition hover:text-white">
          Home
        </Link>
      </div>
    </div>
  );
}
