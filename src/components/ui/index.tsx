"use client";

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
} from "react";

import {
  Loader2,
  Search,
  X,
  MoreHorizontal,
  Check,
  AlertCircle,
  Info,
  ChevronDown,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* =========================================================
   BUTTON
========================================================= */

export { default as Button } from './Button';

/* =========================================================
   BADGE
========================================================= */

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "success"
    | "warning"
    | "danger"
    | "info";

  size?: "sm" | "md";
}

export function Badge({
  children,
  variant = "default",
  size = "sm",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        `
          inline-flex
          items-center
          justify-center

          rounded-full

          font-medium
          whitespace-nowrap

          border
        `,

        size === "sm" &&
          `
            h-6
            px-2.5
            text-[11px]
          `,

        size === "md" &&
          `
            h-7
            px-3
            text-xs
          `,

        variant === "default" &&
          `
            bg-gray-100
            border-gray-200
            text-gray-700

            dark:bg-zinc-800
            dark:border-zinc-700
            dark:text-gray-300
          `,

        variant === "success" &&
          `
            bg-emerald-500/10
            border-emerald-500/20
            text-emerald-600
          `,

        variant === "warning" &&
          `
            bg-amber-500/10
            border-amber-500/20
            text-amber-600
          `,

        variant === "danger" &&
          `
            bg-red-500/10
            border-red-500/20
            text-red-600
          `,

        variant === "info" &&
          `
            bg-blue-500/10
            border-blue-500/20
            text-blue-600
          `,

        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* =========================================================
   SPINNER
========================================================= */

export function Spinner({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Loader2
      size={size}
      className={cn(
        "animate-spin text-orange-500",
        className,
      )}
    />
  );
}

/* =========================================================
   AVATAR
========================================================= */

interface AvatarProps {
  name: string;
  src?: string;
  size?: number;
  className?: string;
}

export function Avatar({
  name,
  src,
  size = 40,
  className,
}: AvatarProps) {
  const initials = name
    .trim()
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const colors = [
    "from-violet-500 to-indigo-500",
    "from-orange-500 to-amber-500",
    "from-pink-500 to-rose-500",
    "from-cyan-500 to-blue-500",
    "from-emerald-500 to-green-500",
  ];

  const color =
    colors[name.charCodeAt(0) % colors.length];

  return (
    <div
      className={cn(
        `
          relative
          shrink-0
          overflow-hidden

          rounded-full

          flex
          items-center
          justify-center

          font-semibold
          text-white
        `,

        !src && `bg-linear-to-br ${color}`,

        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.35,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="
            h-full
            w-full
            object-cover
          "
        />
      ) : (
        initials
      )}
    </div>
  );
}

/* =========================================================
   MODAL
========================================================= */

interface ModalProps {
  open: boolean;
  onClose: () => void;

  title?: string;

  children: ReactNode;

  width?: number;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 520,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (
      e: KeyboardEvent,
    ) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () => {
      document.body.style.overflow = prevOverflow;

      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="
        fixed inset-0 z-1000

        flex items-center justify-center

        bg-black/60
        backdrop-blur-md

        p-4
      "
    >
      <div
        onClick={(e) =>
          e.stopPropagation()
        }
        className="
          relative

          w-full
          overflow-hidden

          rounded-4xl

          border
          border-white/10

          bg-white/95
          dark:bg-zinc-900/95

          shadow-2xl
        "
        style={{
          maxWidth: width,
          maxHeight: "90vh",
        }}
      >
        {/* HEADER */}

        <div
          className="
            flex
            items-center
            justify-between

            border-b
            border-gray-100
            dark:border-zinc-800

            px-6
            py-5
          "
        >
          {title ? (
            <h3
              className="
                text-lg
                font-semibold

                text-gray-900
                dark:text-white
              "
            >
              {title}
            </h3>
          ) : (
            <span />
          )}

          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="
              flex
              h-9
              w-9
              items-center
              justify-center

              rounded-xl

              text-gray-500

              transition-colors

              hover:bg-gray-100

              dark:hover:bg-zinc-800
            "
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}

        <div className="overflow-y-auto p-6 max-h-[calc(90vh-80px)]">
          {children}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   EMPTY STATE
========================================================= */

interface EmptyStateProps {
  icon?: ReactNode;

  title: string;

  description?: string;

  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      className="
        flex
        flex-col
        items-center
        justify-center

        px-6
        py-16

        text-center
      "
    >
      <div
        className="
          mb-5

          flex
          h-20
          w-20

          items-center
          justify-center

          rounded-full

          border
          border-gray-200

          bg-gray-100

          text-gray-500

          dark:border-zinc-800
          dark:bg-zinc-900
        "
      >
        {icon || (
          <MoreHorizontal size={30} />
        )}
      </div>

      <h3
        className="
          text-lg
          font-semibold

          text-gray-900
          dark:text-white
        "
      >
        {title}
      </h3>

      {description && (
        <p
          className="
            mt-2

            max-w-sm

            text-sm
            leading-relaxed

            text-gray-500
            dark:text-gray-400
          "
        >
          {description}
        </p>
      )}

      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   DROPDOWN
========================================================= */

export interface DropdownItem {
  label?: string;

  icon?: ReactNode;

  onClick?: () => void;

  danger?: boolean;

  disabled?: boolean;

  divider?: boolean;
}

interface DropdownMenuProps {
  items: DropdownItem[];

  open: boolean;

  onClose: () => void;

  anchorRef: RefObject<HTMLElement | null>;

  align?: "left" | "right";
}

export function DropdownMenu({
  items,
  open,
  onClose,
  anchorRef,
  align = "right",
}: DropdownMenuProps) {
  const menuRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(
      e: MouseEvent,
    ) {
      if (
        menuRef.current &&
        !menuRef.current.contains(
          e.target as Node,
        ) &&
        !anchorRef.current?.contains(
          e.target as Node,
        )
      ) {
        onClose();
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutside,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutside,
      );
    };
  }, [anchorRef, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className={cn(
        `
          absolute
          top-[calc(100%+8px)]
          z-50

          min-w-50
          overflow-hidden

          rounded-2xl

          border
          border-gray-200

          bg-white/95
          backdrop-blur-xl

          shadow-2xl
          shadow-black/5

          dark:border-zinc-800
          dark:bg-zinc-900/95
        `,

        align === "right"
          ? "right-0"
          : "left-0",
      )}
    >
      <div className="p-2">
        {items.map((item, i) =>
          item.divider ? (
            <div
              key={i}
              className="
                my-2
                h-px

                bg-gray-100
                dark:bg-zinc-800
              "
            />
          ) : (
            <button
              key={i}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                item.onClick?.();
                onClose();
              }}
              className={cn(
                `
                  flex
                  w-full
                  items-center

                  gap-3

                  rounded-xl

                  px-3
                  py-2.5

                  text-sm

                  transition-colors

                  disabled:pointer-events-none
                  disabled:opacity-50
                `,

                item.danger
                  ? `
                    text-red-500

                    hover:bg-red-500/10
                  `
                  : `
                    text-gray-700

                    hover:bg-orange-50
                    hover:text-orange-600

                    dark:text-gray-300
                    dark:hover:bg-orange-500/10
                  `,
              )}
            >
              {item.icon}

              <span>{item.label}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/* =========================================================
   SEARCH INPUT
========================================================= */

interface SearchInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "onChange"
  > {
  value: string;

  onChange: (value: string) => void;

  loading?: boolean;

  clearable?: boolean;
}

export function SearchInput({
  value,
  onChange,

  placeholder = "Search...",

  loading = false,

  clearable = true,

  className,

  ...props
}: SearchInputProps) {
  return (
    <div className="relative">
      {/* SEARCH ICON */}

      <div
        className="
          absolute
          left-3
          top-1/2
          z-10

          -translate-y-1/2

          text-gray-400
        "
      >
        {loading ? (
          <Loader2
            size={17}
            className="animate-spin"
          />
        ) : (
          <Search size={17} />
        )}
      </div>

      {/* INPUT */}

      <input
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        placeholder={placeholder}
        className={cn(
          `
            h-11
            w-full

            rounded-2xl

            border
            border-gray-200

            bg-white/90
            backdrop-blur-xl

            pl-10
            pr-10

            text-sm
            text-gray-900

            outline-none

            transition-all
            duration-200

            placeholder:text-gray-400

            focus:border-orange-300
            focus:ring-4
            focus:ring-orange-500/10

            dark:border-zinc-800
            dark:bg-zinc-900/90
            dark:text-white
          `,
          className,
        )}
        {...props}
      />

      {/* CLEAR */}

      {clearable && value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="
            absolute
            right-3
            top-1/2

            flex
            h-5
            w-5

            -translate-y-1/2

            items-center
            justify-center

            rounded-full

            text-gray-400

            hover:bg-gray-100
            hover:text-gray-600
          "
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* =========================================================
   ALERT
========================================================= */

interface AlertProps {
  title?: string;

  children?: React.ReactNode;

  variant?:
    | "info"
    | "success"
    | "warning"
    | "danger";
}

export function Alert({
  title,
  children,
  variant = "info",
}: AlertProps) {
  const icon =
    variant === "success" ? (
      <Check size={18} />
    ) : variant === "warning" ? (
      <AlertCircle size={18} />
    ) : variant === "danger" ? (
      <AlertCircle size={18} />
    ) : (
      <Info size={18} />
    );

  return (
    <div
      className={cn(
        `
          flex
          gap-3

          rounded-2xl

          border

          p-4
        `,

        variant === "info" &&
          `
            border-blue-200
            bg-blue-500/10
            text-blue-700
          `,

        variant === "success" &&
          `
            border-emerald-200
            bg-emerald-500/10
            text-emerald-700
          `,

        variant === "warning" &&
          `
            border-amber-200
            bg-amber-500/10
            text-amber-700
          `,

        variant === "danger" &&
          `
            border-red-200
            bg-red-500/10
            text-red-700
          `,
      )}
    >
      <div className="mt-0.5 shrink-0">
        {icon}
      </div>

      <div>
        {title && (
          <h4 className="font-medium">
            {title}
          </h4>
        )}

        {children && (
          <div className="mt-1 text-sm opacity-90">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   SELECT
========================================================= */

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;

  onChange: (value: string) => void;

  options: SelectOption[];

  placeholder?: string;

  label?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  label,
}: SelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        aria-label={label ?? placeholder ?? "Select an option"}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="
          h-11
          w-full

          appearance-none

          rounded-2xl

          border
          border-gray-200

          bg-white/90
          dark:bg-zinc-900/90

          px-4
          pr-10

          text-sm

          outline-none

          transition-all

          focus:border-orange-300
          focus:ring-4
          focus:ring-orange-500/10
        "
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown
        size={16}
        className="
          pointer-events-none

          absolute
          right-3
          top-1/2

          -translate-y-1/2

          text-gray-400
        "
      />
    </div>
  );
}