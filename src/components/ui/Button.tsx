"use client";

import { type ReactNode, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

/* =========================================================
   TYPES
========================================================= */

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;

  variant?:
    | "primary"
    | "secondary"
    | "ghost"
    | "danger"
    | "icon"
    | "outline"
    | "glass";

  size?: "xs" | "sm" | "md" | "lg" | "xl" | "icon";

  loading?: boolean;

  fullWidth?: boolean;

  leftIcon?: ReactNode;
  rightIcon?: ReactNode;

  rounded?: "md" | "lg" | "xl" | "full";

  glow?: boolean;
}

/* =========================================================
   COMPONENT
========================================================= */

const Button = ({
  children,

  variant = "primary",
  size = "md",

  className = "",

  disabled = false,
  loading = false,

  fullWidth = false,

  leftIcon,
  rightIcon,

  rounded = "xl",

  glow = true,

  type = "button",

  ...props
}: ButtonProps) => {
  /* =========================================================
     BASE
  ========================================================= */

  const baseStyles = `
    group
    relative

    inline-flex
    items-center
    justify-center

    gap-2
    shrink-0

    font-semibold
    tracking-[0.01em]

    whitespace-nowrap
    select-none

    overflow-hidden

    transition-all
    duration-300
    ease-[cubic-bezier(.4,0,.2,1)]

    active:scale-[0.97]

    disabled:pointer-events-none
    disabled:opacity-50

    outline-none
    focus:outline-none
    focus-visible:outline-none

    focus-visible:ring-2
    focus-visible:ring-orange-400/40
    focus-visible:ring-offset-2

    dark:focus-visible:ring-orange-500/40
  `;

  /* =========================================================
     ROUNDED
  ========================================================= */

  const roundedStyles = {
    md: "rounded-xl",
    lg: "rounded-2xl",
    xl: "rounded-3xl",
    full: "rounded-full",
  };

  /* =========================================================
     VARIANTS
  ========================================================= */

  const variants = {
    /* ================= PRIMARY ================= */

    primary: `
      text-white

      bg-gradient-to-br
      from-orange-500
      via-orange-500
      to-amber-500

      border border-orange-400/40

      ${
        glow
          ? `
      shadow-lg
      shadow-orange-500/20

      hover:shadow-2xl
      hover:shadow-orange-500/30
      `
          : ""
      }

      hover:-translate-y-[2px]

      before:absolute
      before:inset-0

      before:bg-gradient-to-r
      before:from-white/0
      before:via-white/20
      before:to-white/0

      before:translate-x-[-120%]
      hover:before:translate-x-[120%]

      before:transition-transform
      before:duration-1000
    `,

    /* ================= SECONDARY ================= */

    secondary: `
      border border-gray-200/80

      bg-white/80
      backdrop-blur-xl

      text-gray-700

      shadow-sm

      hover:-translate-y-[1px]

      hover:border-orange-300
      hover:bg-orange-50/80
      hover:text-orange-600

      hover:shadow-lg
      hover:shadow-orange-500/10

      dark:border-zinc-700
      dark:bg-zinc-900/80
      dark:text-gray-200

      dark:hover:border-orange-500/40
      dark:hover:bg-orange-500/10
      dark:hover:text-orange-400
    `,

    /* ================= OUTLINE ================= */

    outline: `
      border border-orange-300

      bg-transparent

      text-orange-600

      hover:bg-orange-500
      hover:text-white

      hover:border-orange-500

      dark:border-orange-500/40
      dark:text-orange-400

      dark:hover:bg-orange-500
      dark:hover:text-white
    `,

    /* ================= GHOST ================= */

    ghost: `
      bg-transparent

      text-gray-600

      hover:bg-orange-50
      hover:text-orange-600

      dark:text-gray-300

      dark:hover:bg-orange-500/10
      dark:hover:text-orange-400
    `,

    /* ================= DANGER ================= */

    danger: `
      text-white

      bg-gradient-to-br
      from-red-500
      via-red-500
      to-rose-500

      border border-red-400/40

      shadow-lg
      shadow-red-500/20

      hover:-translate-y-[2px]

      hover:shadow-2xl
      hover:shadow-red-500/30

      before:absolute
      before:inset-0

      before:bg-gradient-to-r
      before:from-white/0
      before:via-white/15
      before:to-white/0

      before:translate-x-[-120%]
      hover:before:translate-x-[120%]

      before:transition-transform
      before:duration-1000
    `,

    /* ================= ICON ================= */

    icon: `
      border border-gray-200

      bg-white/90
      backdrop-blur-xl

      text-gray-600

      shadow-sm

      hover:-translate-y-[1px]

      hover:border-orange-300
      hover:bg-orange-50
      hover:text-orange-500

      hover:shadow-lg
      hover:shadow-orange-500/10

      dark:border-zinc-700
      dark:bg-zinc-900/90
      dark:text-gray-300

      dark:hover:border-orange-500/40
      dark:hover:bg-orange-500/10
      dark:hover:text-orange-400
    `,

    /* ================= GLASS ================= */

    glass: `
      border border-white/20

      bg-white/10
      backdrop-blur-2xl

      text-white

      hover:bg-white/15
      hover:border-white/30

      shadow-lg
      shadow-black/10
    `,
  };

  /* =========================================================
     SIZES
  ========================================================= */

  const sizes = {
    xs: `
      h-8
      px-3

      text-xs
    `,

    sm: `
      h-9
      px-4

      text-sm
    `,

    md: `
      h-11
      px-5

      text-sm
    `,

    lg: `
      h-12
      px-6

      text-base
    `,

    xl: `
      h-14
      px-7

      text-base
    `,

    icon: `
      h-11
      w-11
      p-0
    `,
  };

  /* =========================================================
     ICON SIZE
  ========================================================= */

  const iconSize =
    size === "xs"
      ? 14
      : size === "sm"
        ? 16
        : size === "lg" || size === "xl"
          ? 18
          : 17;

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`
        ${baseStyles}
        ${roundedStyles[rounded]}
        ${variants[variant]}
        ${sizes[size]}

        ${fullWidth ? "w-full" : ""}

        ${className}
      `}
      {...props}
    >
      {/* BACKGROUND OVERLAY */}

      <span
        className="
          absolute
          inset-0

          opacity-0
          transition-opacity
          duration-300

          group-hover:opacity-100

          bg-white/[0.03]
        "
      />

      {/* CONTENT */}

      <span
        className="
          relative
          z-10

          flex
          items-center
          justify-center

          gap-2
        "
      >
        {/* LEFT ICON / LOADER */}

        {loading ? (
          <Loader2
            size={iconSize}
            className="
              animate-spin
              shrink-0
            "
          />
        ) : (
          leftIcon && (
            <span
              className="
                flex
                items-center
                justify-center

                shrink-0
              "
            >
              {leftIcon}
            </span>
          )
        )}

        {/* TEXT */}

        {children && (
          <span
            className="
              flex
              items-center

              leading-none
            "
          >
            {children}
          </span>
        )}

        {/* RIGHT ICON */}

        {!loading && rightIcon && (
          <span
            className="
              flex
              items-center
              justify-center

              shrink-0
            "
          >
            {rightIcon}
          </span>
        )}
      </span>
    </button>
  );
};

export default Button;