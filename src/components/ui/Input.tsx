"use client";

import {
  type ReactNode,
  forwardRef,
  type InputHTMLAttributes,
  useId,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* =========================================================
   TYPES
========================================================= */

interface InputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;

  error?: string;
  helperText?: string;

  leftIcon?: ReactNode;
  rightIcon?: ReactNode;

  inputClassName?: string;
  containerClassName?: string;

  loading?: boolean;

  success?: boolean;

  showPasswordToggle?: boolean;
}

/* =========================================================
   INPUT
========================================================= */

const Input = forwardRef<
  HTMLInputElement,
  InputProps
>(
  (
    {
      label,

      error,
      helperText,

      leftIcon,
      rightIcon,

      inputClassName = "",
      containerClassName = "",

      required = false,
      disabled = false,

      loading = false,
      success = false,

      showPasswordToggle = true,

      className,

      type = "text",

      id,

      ...props
    },
    ref,
  ) => {
    const generatedId = useId();

    const inputId = id || generatedId;

    const [showPassword, setShowPassword] =
      useState(false);

    const isPassword =
      type === "password";

    const resolvedType =
      isPassword &&
      showPasswordToggle &&
      showPassword
        ? "text"
        : type;

    const hasError = !!error;

    const hasLeftIcon = !!leftIcon;

    const hasRightContent =
      !!rightIcon ||
      loading ||
      success ||
      (isPassword &&
        showPasswordToggle);

    return (
      <div
        className={cn(
          "w-full space-y-2",
          className,
        )}
      >
        {/* =====================================================
            LABEL
        ===================================================== */}

        {label && (
          <label
            htmlFor={inputId}
            className="
              inline-flex
              items-center
              gap-1.5

              text-sm
              font-semibold

              text-gray-700
              dark:text-gray-300
            "
          >
            <span>{label}</span>

            {required && (
              <span className="text-red-500">
                *
              </span>
            )}
          </label>
        )}

        {/* =====================================================
            INPUT WRAPPER
        ===================================================== */}

        <div
          className={cn(
            `
              group
              relative
            `,
            containerClassName,
          )}
        >
          {/* =====================================================
              GLOW EFFECT
          ===================================================== */}

          <div
            className={cn(
              `
                pointer-events-none

                absolute
                inset-0

                rounded-2xl

                opacity-0
                blur-xl

                transition-all
                duration-300

                group-focus-within:opacity-100
              `,

              hasError
                ? "bg-red-500/10"
                : success
                  ? "bg-emerald-500/10"
                  : "bg-orange-500/10",
            )}
          />

          {/* =====================================================
              LEFT ICON
          ===================================================== */}

          {hasLeftIcon && (
            <div
              className={cn(
                `
                  pointer-events-none

                  absolute
                  left-4
                  top-1/2

                  z-20

                  flex
                  -translate-y-1/2
                  items-center
                  justify-center

                  transition-colors
                  duration-200
                `,

                hasError
                  ? "text-red-500"
                  : success
                    ? "text-emerald-500"
                    : `
                      text-gray-400

                      group-focus-within:text-orange-500
                    `,
              )}
            >
              {leftIcon}
            </div>
          )}

          {/* =====================================================
              INPUT
          ===================================================== */}

          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            disabled={disabled || loading}
            aria-invalid={hasError}
            aria-describedby={
              error
                ? `${inputId}-error`
                : helperText
                  ? `${inputId}-helper`
                  : undefined
            }
            className={cn(
              `
                relative
                z-10

                w-full

                rounded-2xl
                border

                bg-white/90
                backdrop-blur-xl

                text-gray-900
                dark:bg-zinc-900/90
                dark:text-white

                shadow-sm

                transition-all
                duration-200

                outline-none

                placeholder:text-gray-400
                dark:placeholder:text-gray-500

                disabled:cursor-not-allowed
                disabled:opacity-60

                focus:ring-4
              `,

              /* ================= PADDING ================= */

              hasLeftIcon
                ? "pl-11"
                : "pl-4",

              hasRightContent
                ? "pr-11"
                : "pr-4",

              /* ================= SIZE ================= */

              `
                h-12
                py-3
                text-sm
              `,

              /* ================= STATES ================= */

              hasError
                ? `
                  border-red-500

                  focus:border-red-500
                  focus:ring-red-500/15
                `
                : success
                  ? `
                    border-emerald-500

                    focus:border-emerald-500
                    focus:ring-emerald-500/15
                  `
                  : `
                    border-gray-200
                    dark:border-zinc-700

                    hover:border-orange-300
                    dark:hover:border-orange-700

                    focus:border-orange-500
                    focus:ring-orange-500/15
                  `,

              inputClassName,
            )}
            {...props}
          />

          {/* =====================================================
              RIGHT CONTENT
          ===================================================== */}

          {hasRightContent && (
            <div
              className={cn(
                `
                  absolute
                  right-4
                  top-1/2

                  z-20

                  flex
                  -translate-y-1/2
                  items-center
                  justify-center
                `,

                hasError
                  ? "text-red-500"
                  : success
                    ? "text-emerald-500"
                    : `
                      text-gray-400

                      group-focus-within:text-orange-500
                    `,
              )}
            >
              {/* ================= LOADING ================= */}

              {loading ? (
                <Loader2
                  size={17}
                  className="animate-spin"
                />
              ) : /* ================= PASSWORD TOGGLE ================= */
              isPassword &&
                showPasswordToggle ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() =>
                    setShowPassword(
                      !showPassword,
                    )
                  }
                  className="
                    flex
                    items-center
                    justify-center

                    text-gray-400

                    transition-colors

                    hover:text-orange-500
                  "
                >
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              ) : /* ================= SUCCESS ================= */
              success ? (
                <CheckCircle2 size={18} />
              ) : (
                rightIcon
              )}
            </div>
          )}
        </div>

        {/* =====================================================
            ERROR
        ===================================================== */}

        {hasError && (
          <div
            id={`${inputId}-error`}
            className="
              flex
              items-center
              gap-1.5

              text-sm
              font-medium

              text-red-500
            "
          >
            <AlertCircle size={14} />

            <span>{error}</span>
          </div>
        )}

        {/* =====================================================
            HELPER TEXT
        ===================================================== */}

        {!hasError && helperText && (
          <p
            id={`${inputId}-helper`}
            className="
              text-sm
              leading-relaxed

              text-gray-500
              dark:text-gray-400
            "
          >
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;