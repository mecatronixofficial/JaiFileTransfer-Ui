"use client";

import { useState, useEffect, useMemo } from "react";
import {
  User as UserIcon,
  Mail,
  Phone,
  Building2,
  Shield,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Save,
  Lock,
  AlertCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { usersApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { handleApiError } from "@/lib/error-handler";
import { showToast } from "@/lib/toast";
import Card from "@/components/ui/Card";
import { Avatar } from "@/components/ui";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Link from "next/link";

const PHONE_REGEX = /^[0-9]{10}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function roleBadgeStyles(role?: string): string {
  switch (role?.toUpperCase()) {
    case "SUPERADMIN":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "ADMIN":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    default:
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  }
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  /* =========================
     FORM STATE
  ========================= */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* =========================
     POPULATE FROM USER
  ========================= */
  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setDepartment(user.department ?? "");
      setPhone(user.phone ?? "");
    }
  }, [user]);

  /* =========================
     DERIVED
  ========================= */
  const hasChanges = useMemo(() => {
    if (!user) return false;
    return (
      name.trim() !== (user.name ?? "") ||
      email.trim() !== (user.email ?? "") ||
      department.trim() !== (user.department ?? "") ||
      phone.trim() !== (user.phone ?? "")
    );
  }, [name, email, department, phone, user]);

  /* =========================
     SAVE
  ========================= */
  async function handleSave(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;

    const next: Record<string, string> = {};

    if (!name.trim()) next.name = "Name is required";
    else if (name.trim().length > 100) next.name = "Maximum 100 characters";

    if (!email.trim()) next.email = "Email is required";
    else if (!EMAIL_REGEX.test(email.trim()))
      next.email = "Enter a valid email";

    if (phone.trim() && !PHONE_REGEX.test(phone.trim())) {
      next.phone = "Phone must be a valid 10-digit number";
    }

    if (department.trim().length > 100) {
      next.department = "Maximum 100 characters";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (!hasChanges) {
      return showToast.info("No changes to save");
    }

    try {
      setSaving(true);
      await usersApi.updateMe({
        name: name.trim(),
        email: email.trim(),
        department: department.trim() || null,
        phone: phone.trim() || null,
      });
      await refreshUser();
      showToast.success("Profile updated successfully");
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!user) return;
    setName(user.name ?? "");
    setEmail(user.email ?? "");
    setDepartment(user.department ?? "");
    setPhone(user.phone ?? "");
    setErrors({});
  }

  /* =========================
     UI
  ========================= */
  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in mx-auto px-4 py-6 sm:px-6">
          {/* ============== HEADER ============== */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              My Profile
            </h1>
            <p className="mt-2 text-base text-gray-500 dark:text-gray-400">
              View and update your personal information
            </p>
          </div>

          {/* ============== PROFILE CARD (banner + identity) ============== */}
          <Card className="mb-6 overflow-hidden">
            <div className="relative h-32 bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_50%)]" />
            </div>

            <div className="px-6 pb-6 sm:px-8 -mt-14 relative">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="rounded-full ring-4 ring-white shadow-lg dark:ring-gray-900">
                  <Avatar name={user?.name || "U"} size={96} />
                </div>

                <div className="flex-1 sm:pb-2 min-w-0">
                  <h2 className="truncate text-2xl font-bold text-gray-900 dark:text-white">
                    {user?.name || "—"}
                  </h2>
                  <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                    {user?.email}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${roleBadgeStyles(user?.role)}`}
                    >
                      <Shield size={11} />
                      {user?.role || "User"}
                    </span>

                    {user?.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        Inactive
                      </span>
                    )}

                    {user?.isEmailVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        <CheckCircle2 size={11} />
                        Email verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-1 text-[11px] font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        <AlertCircle size={11} />
                        Email not verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ============== LAYOUT: FORM + META ============== */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            {/* ============== EDIT FORM ============== */}
            <Card className="p-6 sm:p-8">
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Personal Information
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Update your name, email, and contact details
                </p>
              </div>

              <form onSubmit={handleSave} className="space-y-5" noValidate>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Input
                    label="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    leftIcon={<UserIcon size={16} />}
                    error={errors.name}
                    maxLength={100}
                    required
                  />

                  <Input
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    leftIcon={<Mail size={16} />}
                    error={errors.email}
                    autoComplete="email"
                    required
                  />

                  <Input
                    label="Phone Number"
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit number"
                    leftIcon={<Phone size={16} />}
                    error={errors.phone}
                    maxLength={10}
                    autoComplete="tel"
                  />

                  <Input
                    label="Department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Engineering"
                    leftIcon={<Building2 size={16} />}
                    error={errors.department}
                    maxLength={100}
                  />
                </div>

                {/* Form footer */}
                <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-gray-100 pt-5 dark:border-gray-800 sm:flex-row sm:items-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {hasChanges
                      ? "You have unsaved changes"
                      : "All changes saved"}
                  </p>

                  <div className="flex flex-col gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleReset}
                      disabled={!hasChanges || saving}
                    >
                      Reset
                    </Button>
                    <Button
                      type="submit"
                      loading={saving}
                      disabled={!hasChanges}
                      leftIcon={<Save size={16} />}
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>
              </form>
            </Card>

            {/* ============== SIDE: ACCOUNT META ============== */}
            <aside className="space-y-4">
              {/* Account info */}
              <Card className="p-5">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Account
                </h3>
                <dl className="space-y-3.5 text-sm">
                  <MetaRow
                    icon={<Shield size={14} />}
                    label="Role"
                    value={user?.role ?? "—"}
                  />
                  <MetaRow
                    icon={<Calendar size={14} />}
                    label="Joined"
                    value={formatDate(user?.createdAt)}
                  />
                  <MetaRow
                    icon={<Clock size={14} />}
                    label="Last login"
                    value={formatDateTime(user?.lastLoginAt)}
                  />
                  <MetaRow
                    icon={
                      user?.isEmailVerified ? (
                        <CheckCircle2 size={14} className="text-green-500" />
                      ) : (
                        <XCircle size={14} className="text-yellow-500" />
                      )
                    }
                    label="Email"
                    value={user?.isEmailVerified ? "Verified" : "Not verified"}
                  />
                </dl>
              </Card>

              {/* Security shortcuts */}
              <Card className="p-5">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Security
                </h3>

                <Link
                  href="/settings"
                  className="group flex items-center gap-3 rounded-xl border border-gray-200 p-3 transition-colors hover:border-orange-300 hover:bg-orange-50/40 dark:border-gray-800 dark:hover:border-orange-700 dark:hover:bg-orange-900/10"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                    <Lock size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Change password
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Update your password
                    </p>
                  </div>
                </Link>
              </Card>

              {/* Help */}
              <Card className="border-orange-200 bg-orange-50/40 p-5 dark:border-orange-900/50 dark:bg-orange-900/10">
                <h3 className="mb-1.5 text-sm font-semibold text-orange-900 dark:text-orange-300">
                  Need help?
                </h3>
                <p className="text-xs leading-relaxed text-orange-800/80 dark:text-orange-200/70">
                  If you need to change your role or have account issues,
                  contact your administrator.
                </p>
              </Card>
            </aside>
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}

/* =========================
   META ROW
========================= */
function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        {label}
      </dt>
      <dd className="text-right font-medium text-gray-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}
