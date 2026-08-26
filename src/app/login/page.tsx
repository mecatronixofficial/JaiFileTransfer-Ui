"use client";

import { useState, useEffect, useId, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  Shield,
  CheckCircle2,
  Check,
  Sparkles,
  FolderLock,
  Zap,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { showToast } from "@/lib/toast";
import { handleApiError } from "@/lib/error-handler";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Image from "next/image";
import Img_Helper from "@/helper/img_helper";

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

type Step = "login" | "twoFactor" | "forgot" | "reset";

const GREEN_INPUT_CLASSES =
  "!h-11 !border-[rgb(73,140,1)]/35 hover:!border-[rgb(73,140,1)] focus:!border-[rgb(73,140,1)] focus:!ring-[rgb(73,140,1)]/20";

const GREEN_BUTTON_CLASSES =
  "!border-[rgb(73,140,1)] !from-[rgb(73,140,1)] !via-[rgb(73,140,1)] !to-[rgb(94,160,28)] !shadow-[rgb(73,140,1)]/25 focus-visible:!ring-[rgb(73,140,1)]/40";

function getStrength(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: "Weak", color: "bg-red-500" };
  if (s <= 2) return { score: s, label: "Fair", color: "bg-yellow-500" };
  if (s <= 3) return { score: s, label: "Good", color: "bg-blue-500" };
  return { score: s, label: "Strong", color: "bg-emerald-500" };
}

function OtpInput({
  value,
  onChange,
  error,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const errorId = useId();

  function handleChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    if (!char) {
      if (value[i]) {
        onChange(value.substring(0, i) + value.substring(i + 1));
      }
      return;
    }
    const next = value.substring(0, i) + char + value.substring(i + 1);
    onChange(next.substring(0, 6));
    if (i < 5) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (value[i]) {
        onChange(value.substring(0, i) + value.substring(i + 1));
      } else if (i > 0) {
        onChange(value.substring(0, i - 1) + value.substring(i));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      refs.current[i + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div className="w-full min-w-0">
      <div className="mx-auto grid w-full max-w-[19rem] grid-cols-6 gap-1.5 min-[380px]:gap-2 sm:gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            disabled={disabled}
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`OTP digit ${i + 1}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            title={`OTP digit ${i + 1}`}
            placeholder="·"
            value={value[i] || ""}
            onChange={(e) => handleChange(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className={`
              h-10 w-full min-w-0 text-center text-sm font-bold min-[380px]:h-11 min-[380px]:text-base
              rounded-xl border-2 bg-white text-gray-900 min-[380px]:rounded-2xl dark:bg-zinc-900 dark:text-white
              transition-all duration-200 outline-none shadow-sm disabled:cursor-not-allowed disabled:opacity-60
              focus:ring-4
              ${error
                ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
                : value[i]
                  ? "border-[rgb(73,140,1)]/60 focus:border-[rgb(73,140,1)] focus:ring-[rgb(73,140,1)]/15"
                  : "border-gray-200 hover:border-[rgb(73,140,1)]/40 focus:border-[rgb(73,140,1)] focus:ring-[rgb(73,140,1)]/15 dark:border-zinc-700"
              }
            `}
          />
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-center text-sm font-medium text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login, verifyTwoFactor } = useAuth();

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPass, setNewPass] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [twoFactorOtp, setTwoFactorOtp] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, isLoading, router]);

  const strength = newPass ? getStrength(newPass) : null;

  function goToStep(s: Step) {
    setErrors({});
    setStep(s);
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return setErrors({ email: "Email is required" });
    if (!password.trim()) return setErrors({ password: "Password is required" });
    try {
      setLoading(true);
      // AuthContext.login() handles the dashboard redirect.
      const result = await login(normalizedEmail, password);
      if (result.requiresTwoFactor) {
        setEmail(result.email ?? normalizedEmail);
        setStep("twoFactor");
        showToast.success("Verification code sent");
      } else {
        showToast.success("Login successful");
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message || "Invalid email or password";
      setErrors({ general: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleTwoFactor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    if (twoFactorOtp.length !== 6) {
      return setErrors({ twoFactorOtp: "Enter all 6 digits" });
    }

    try {
      setLoading(true);
      await verifyTwoFactor(email, twoFactorOtp);
      showToast.success("Login successful");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message || "Invalid or expired OTP";
      setErrors({ twoFactorOtp: msg });
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return setErrors({ email: "Email is required" });
    try {
      setLoading(true);
      const { authApi } = await import("@/lib/api");
      await authApi.forgotPassword(normalizedEmail);
      setEmail(normalizedEmail);
      showToast.success("Reset instructions sent");
      setStep("reset");
    } catch (err: unknown) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    if (resetToken.length < 6) return setErrors({ resetToken: "Enter all 6 digits" });
    if (newPass.length < 8) return setErrors({ newPass: "Minimum 8 characters required" });
    try {
      setLoading(true);
      const { authApi } = await import("@/lib/api");
      await authApi.resetPassword({ email: email.trim().toLowerCase(), otp: resetToken, newPassword: newPass });
      showToast.success("Password reset successful");
      setStep("login");
      setPassword("");
      setNewPass("");
      setResetToken("");
    } catch (err: unknown) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  /* Loading screen */
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-[rgb(73,140,1)]/20" />
            <div className="absolute inset-0 rounded-full border-4 border-[rgb(73,140,1)] border-t-transparent animate-spin" />
          </div>
          <p className="text-sm font-semibold text-gray-400 tracking-wide dark:text-gray-500">Loading workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full min-w-0 overflow-x-hidden bg-white dark:bg-zinc-950 lg:grid lg:h-dvh lg:grid-cols-2 lg:overflow-hidden">
      <section className="relative hidden min-h-0 min-w-0 overflow-hidden bg-gradient-to-br from-[#f6faef] via-white to-orange-50 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0">
          <Image
            src={Img_Helper.home.background}
            alt=""
            fill
            loading="eager"
            sizes="(min-width: 1024px) 50vw, 0px"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-[#f7faef]/65 to-white/35" />
          <div className="absolute -left-24 top-20 h-80 w-80 rounded-full bg-[rgb(73,140,1)]/10 blur-3xl" />
          <div className="absolute -right-20 bottom-10 h-96 w-96 rounded-full bg-orange-400/15 blur-3xl" />
        </div>

        <div className="login-grid-overlay pointer-events-none absolute inset-0 opacity-35" />
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[rgb(73,140,1)]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-28 h-[30rem] w-[30rem] rounded-full bg-orange-300/20 blur-3xl" />

        <div className="scrollbar-hide relative z-10 flex h-full min-h-0 w-full flex-col overflow-y-auto px-7 py-6 xl:px-12 xl:py-8 2xl:px-16 2xl:py-10">
          <header className="flex h-auto w-full shrink-0 items-center">
            <Link
              href="/"
              aria-label="Jai Export Enterprises home"
              className="flex w-full min-w-0 items-center justify-between gap-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[rgb(73,140,1)]/40"
            >
              <span className="min-w-0">
                <span className="company-name block truncate text-lg font-extrabold uppercase tracking-[0.12em] text-slate-950">
                  Jai Export Enterprises
                </span>
                <span className="mt-0.5 inline-flex items-center gap-2 text-base font-semibold text-[rgb(62,120,1)]">
                  File Transfer Service
                  <Sparkles
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-orange-500"
                  />
                </span>
              </span>
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-2 shadow-md shadow-gray-200/50">
                <Image
                  src={Img_Helper.logo.jai_logo}
                  alt=""
                  aria-hidden="true"
                  width={50}
                  height={34}
                  className="h-auto w-full object-contain"
                />
              </span>
            </Link>
          </header>

          <div className="flex min-h-fit flex-1 flex-col justify-center py-2 xl:py-3 2xl:py-4">
            <div className="max-w-2xl">

              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="company-name mt-5 text-[2.5rem] leading-[1.03] tracking-[0.01em] text-slate-950 font-bold">
                  <span className="block bg-gradient-to-r from-[rgb(221,155,2)] via-orange-500 to-orange-500 bg-clip-text text-4xl text-transparent">
                    JAI EXPORT
                  </span>
                  <span className="block bg-gradient-to-r from-[rgb(73,140,1)] via-lime-600 to-lime-500 bg-clip-text text-3xl text-transparent">
                    ENTERPRISES
                  </span>
                </h1>
              </div>

              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 xl:text-base xl:leading-7">
                Easily share and transfer files over the internet with convenience.
                Enjoy extensive customization options and robust tracking capabilities.
              </p>

              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-slate-600 xl:mt-6 xl:text-sm">
                {["Secure cloud storage", "Role-based access", "Audit tracking"].map(
                  (item) => (
                    <span key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[rgb(73,140,1)]" />
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 2xl:mt-8 2xl:gap-4">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="flex min-w-0 flex-col rounded-2xl border border-white/90 bg-white/75 p-3.5 shadow-md shadow-slate-900/5 backdrop-blur transition hover:-translate-y-1 hover:border-[rgb(73,140,1)]/20 hover:shadow-xl xl:p-4"
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${feature.color}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <h2 className="mt-3 text-sm font-bold leading-tight text-slate-900 xl:text-base">
                      {feature.title}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {feature.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-4 text-xs text-slate-500">
            <span>&copy; 2026 <span className="company-name">Jai Export Enterprises</span></span>
            <nav aria-label="Legal" className="flex items-center gap-4 font-semibold">
              <a
                href="https://export.jai-india.com/privacy"
                className="transition hover:text-[rgb(62,120,1)]"
              >
                Privacy
              </a>
              <a
                href="https://export.jai-india.com/terms"
                className="transition hover:text-[rgb(62,120,1)]"
              >
                Terms
              </a>
            </nav>
          </footer>
        </div>
      </section>

      <main
        id="login-form"
        className="login-right-bg flex min-h-dvh w-full min-w-0 flex-col overflow-y-auto px-3 py-4 min-[380px]:px-4 sm:px-6 sm:py-6 dark:bg-zinc-950 lg:h-dvh lg:min-h-0 lg:px-8 lg:py-4 xl:px-10"
      >
        <div className="animate-fade-in mx-auto my-auto w-full min-w-0 max-w-md">
          {/* Card */}
          <div className="rounded-2xl bg-white p-4 shadow-lg shadow-gray-200/70 ring-1 ring-gray-100 min-[380px]:p-5 sm:rounded-3xl sm:p-6 sm:shadow-xl dark:bg-zinc-900 dark:shadow-none dark:ring-zinc-800 lg:p-7">

            {/* Mobile logo */}
            <Link href="/" className="mb-4 flex min-w-0 items-center gap-3 sm:mb-5 lg:hidden">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(73,140,1)] shadow-lg shadow-[rgb(73,140,1)]/25">
                <Image
                  src={Img_Helper.logo.jai_logo}
                  alt=""
                  width={22}
                  height={15}
                  className="h-auto w-[22px] object-contain"
                  style={{ height: "auto" }}
                />
              </span>
              <span className="min-w-0">
                <span className="company-name block truncate text-sm font-extrabold text-gray-900 min-[380px]:text-base dark:text-white">
                  Jai Export Enterprises
                </span>
                <span className="block text-[11px] font-medium text-gray-400">
                  File Transfer Service
                </span>
              </span>
            </Link>

            {/* Multi-step indicator */}
            {(step === "forgot" || step === "reset") && (
              <div className="mb-5 flex items-center gap-2">
                {(["forgot", "reset"] as const).map((s, i) => (
                  <div key={s} className="flex items-center gap-2 flex-1">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${step === s || (s === "forgot" && step === "reset")
                        ? "bg-[rgb(73,140,1)]/100 text-white shadow-lg shadow-[rgb(73,140,1)]/30"
                        : "bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-gray-500"
                        }`}
                    >
                      {s === "forgot" && step === "reset" ? (
                        <Check size={13} strokeWidth={3} />
                      ) : (
                        i + 1
                      )}
                    </div>
                    {i === 0 && (
                      <div
                        className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${step === "reset" ? "bg-[rgb(73,140,1)]/100" : "bg-gray-200 dark:bg-zinc-700"}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Header */}
            <div className="mb-4 sm:mb-5">
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[rgb(73,140,1)]/10 px-3 py-1.5 text-xs font-semibold text-[rgb(73,140,1)] ring-1 ring-[rgb(73,140,1)]/25 dark:bg-[rgb(73,140,1)]/10 dark:text-[rgb(104,170,34)] dark:ring-[rgb(73,140,1)]/40">
                <Lock size={11} />
                {step === "login"
                  ? "Secure sign-in"
                  : step === "twoFactor"
                    ? "Two-factor verification"
                    : step === "forgot"
                      ? "Account recovery — step 1"
                      : "Account recovery — step 2"}
              </span>

              {step !== "login" && (
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 min-[380px]:text-[1.65rem] sm:text-[1.85rem] dark:text-white">
                  {step === "twoFactor" && "Verify your sign-in"}
                  {step === "forgot" && "Forgot password?"}
                  {step === "reset" && "Create new password"}
                </h1>
              )}

              <p className={`${step === "login" ? "mt-3" : "mt-1.5"} text-sm leading-relaxed text-gray-500 dark:text-gray-400`}>
                {step === "login" && "Sign in to access your secure workspace."}
                {step === "twoFactor" && (
                  <>
                    We sent a 6-digit code to{" "}
                    <span className="break-all font-semibold text-gray-700 dark:text-gray-200">
                      {email}
                    </span>
                    .
                  </>
                )}
                {step === "forgot" && "Enter your email and we'll send reset instructions."}
                {step === "reset" && (
                  <>
                    We sent a 6-digit code to{" "}
                    <span className="break-all font-semibold text-gray-700 dark:text-gray-200">{email || "your email"}</span>.
                  </>
                )}
              </p>
            </div>

            {step === "login" && (
              <form onSubmit={handleLogin} className="space-y-4 animate-fade-in">
                {errors.general && (
                  <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 dark:border-red-900/50 dark:bg-red-950/30">
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500">
                      <span className="text-[10px] font-extrabold text-white">!</span>
                    </div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{errors.general}</p>
                  </div>
                )}

                <Input
                  className="login-green-input"
                  inputClassName={GREEN_INPUT_CLASSES}
                  label="Email address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  error={errors.email}
                  leftIcon={<Mail size={16} />}
                  autoComplete="email"
                  disabled={loading}
                  required
                />

                <Input
                  className="login-green-input"
                  inputClassName={GREEN_INPUT_CLASSES}
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  error={errors.password}
                  leftIcon={<Lock size={16} />}
                  autoComplete="current-password"
                  disabled={loading}
                />

                <div className="flex flex-col items-start gap-3 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
                  <label className="flex cursor-pointer select-none items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={loading}
                      className="sr-only"
                    />
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all duration-200 ${rememberMe
                        ? "border-[rgb(73,140,1)] bg-[rgb(73,140,1)]/100 shadow-md shadow-[rgb(73,140,1)]/30"
                        : "border-gray-300 bg-white dark:border-zinc-600 dark:bg-zinc-800"
                        }`}
                    >
                      {rememberMe && <Check size={11} className="text-white" strokeWidth={3} />}
                    </div>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Remember me</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => goToStep("forgot")}
                    disabled={loading}
                    className="text-sm font-semibold text-[rgb(73,140,1)] transition hover:text-[rgb(73,140,1)]"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button
                  className={GREEN_BUTTON_CLASSES}
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  fullWidth
                  rightIcon={<ArrowRight size={18} />}
                  rounded="xl"
                >
                  Sign In
                </Button>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100 dark:border-zinc-800" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-xs font-medium text-gray-400 dark:bg-zinc-900 dark:text-gray-500">
                      Don&apos;t have an account?
                    </span>
                  </div>
                </div>

                <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                  Contact your{" "}
                  <span className="font-semibold text-gray-700 dark:text-gray-200">administrator</span>{" "}
                  to get access.
                </p>
              </form>
            )}

            {step === "twoFactor" && (
              <form onSubmit={handleTwoFactor} className="space-y-5 animate-fade-in">
                <OtpInput
                  value={twoFactorOtp}
                  onChange={setTwoFactorOtp}
                  error={errors.twoFactorOtp}
                  disabled={loading}
                />
                <Button
                  className={GREEN_BUTTON_CLASSES}
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  fullWidth
                  rightIcon={<Shield size={18} />}
                  rounded="xl"
                >
                  Verify and Sign In
                </Button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setTwoFactorOtp("");
                    goToStep("login");
                  }}
                  className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <ArrowLeft size={15} />
                  Back to sign in
                </button>
              </form>
            )}

            {/* Forgot password */}
            {step === "forgot" && (
              <form onSubmit={handleForgotPassword} className="space-y-4 animate-fade-in">
                <Input
                  className="login-green-input"
                  inputClassName={GREEN_INPUT_CLASSES}
                  label="Email address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  error={errors.email}
                  leftIcon={<Mail size={16} />}
                  autoComplete="email"
                  disabled={loading}
                  required
                />

                <Button
                  className={GREEN_BUTTON_CLASSES}
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  fullWidth
                  rightIcon={<ArrowRight size={18} />}
                  rounded="xl"
                >
                  Send Reset Instructions
                </Button>

                <button
                  type="button"
                  onClick={() => goToStep("login")}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <ArrowLeft size={15} />
                  Back to sign in
                </button>
              </form>
            )}

            {/* Reset password */}
            {step === "reset" && (
              <form onSubmit={handleResetPassword} className="space-y-4 animate-fade-in">
                <div className="space-y-3">
                  <label className="block text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Enter 6-digit OTP
                  </label>
                  <OtpInput
                    value={resetToken}
                    onChange={setResetToken}
                    error={errors.resetToken}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Input
                    className="login-green-input"
                    inputClassName={GREEN_INPUT_CLASSES}
                    label="New password"
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Create a strong password"
                    error={errors.newPass}
                    leftIcon={<Lock size={16} />}
                    autoComplete="new-password"
                    disabled={loading}
                  />

                  {newPass && strength && (
                    <div className="space-y-1.5 px-0.5">
                      <div className="flex gap-1.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < strength.score ? strength.color : "bg-gray-200 dark:bg-zinc-700"
                              }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Strength:{" "}
                        <span
                          className={
                            strength.score <= 1
                              ? "font-semibold text-red-500"
                              : strength.score <= 2
                                ? "font-semibold text-yellow-500"
                                : strength.score <= 3
                                  ? "font-semibold text-blue-500"
                                  : "font-semibold text-emerald-500"
                          }
                        >
                          {strength.label}
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  className={GREEN_BUTTON_CLASSES}
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  fullWidth
                  rightIcon={<CheckCircle2 size={18} />}
                  rounded="xl"
                >
                  Reset Password
                </Button>

                <button
                  type="button"
                  onClick={() => goToStep("login")}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <ArrowLeft size={15} />
                  Back to sign in
                </button>
              </form>
            )}

          </div>

          <footer className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2 text-center text-[11px] text-gray-400 lg:hidden">
            <span className="basis-full min-[430px]:basis-auto">
              &copy; 2026 <span className="company-name">Jai Export Enterprises</span>
            </span>
            <a
              href="https://export.jai-india.com/privacy"
              className="font-semibold transition hover:text-[rgb(62,120,1)]"
            >
              Privacy
            </a>
            <a
              href="https://export.jai-india.com/terms"
              className="font-semibold transition hover:text-[rgb(62,120,1)]"
            >
              Terms
            </a>
          </footer>
        </div>
      </main>
    </div>
  );
}
