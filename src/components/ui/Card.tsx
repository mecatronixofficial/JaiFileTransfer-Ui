"use client";

import { type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* =========================================================
   TYPES
========================================================= */

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
  glass?: boolean;
  glow?: boolean;
  padding?: boolean;
  bordered?: boolean;
  blur?: boolean;
  size?: "sm" | "md" | "lg";
  gradient?: boolean;
}

/* =========================================================
   CARD
========================================================= */

const Card = ({
  children,
  className = "",
  hover = false,
  glass = false,
  glow = false,
  padding = false,
  bordered = true,
  blur = true,
  size = "md",
  gradient = false,
  ...props
}: CardProps) => {
  const sizes = {
    sm: "rounded-2xl",
    md: "rounded-3xl",
    lg: "rounded-[2rem]",
  };

  return (
    <div
      {...props}
      className={cn(
        "group relative overflow-hidden isolate transition-all duration-300 ease-in-out shadow-sm shadow-black/3 dark:shadow-black/20",
        sizes[size],

        glass
          ? cn(
              "bg-white/70 dark:bg-zinc-900/60",
              blur && "backdrop-blur-2xl",
              bordered && "border border-white/20 dark:border-white/10",
            )
          : cn(
              "bg-white/95 dark:bg-zinc-900/95",
              bordered && "border border-gray-200/80 dark:border-zinc-800",
            ),

        hover &&
          "hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-300/70 dark:hover:border-orange-700/60",

        glow &&
          "before:absolute before:inset-0 before:bg-linear-to-br before:from-orange-500/[0.07] before:via-transparent before:to-transparent before:pointer-events-none",

        gradient &&
          "after:absolute after:inset-0 after:bg-linear-to-br after:from-white/2 after:via-transparent after:to-orange-500/3 after:pointer-events-none",

        padding && (size === "sm" ? "p-4" : size === "lg" ? "p-8" : "p-6"),

        className,
      )}
    >
      {/* Top shine */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/60 to-transparent dark:via-white/10" />

      {/* Hover light */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_60%)]" />

      <div className="relative z-10">{children}</div>
    </div>
  );
};

/* =========================================================
   HEADER
========================================================= */

interface SectionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const CardHeader = ({ children, className = "", ...props }: SectionProps) => (
  <div
    {...props}
    className={cn(
      "flex items-center justify-between gap-4 px-6 py-5 border-b border-gray-100 dark:border-zinc-800",
      className,
    )}
  >
    {children}
  </div>
);

/* =========================================================
   TITLE
========================================================= */

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
  gradient?: boolean;
}

export const CardTitle = ({ children, className = "", gradient = false, ...props }: CardTitleProps) => (
  <h3
    {...props}
    className={cn(
      "text-lg font-semibold tracking-tight text-gray-900 dark:text-white",
      gradient && "bg-linear-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent",
      className,
    )}
  >
    {children}
  </h3>
);

/* =========================================================
   DESCRIPTION
========================================================= */

interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

export const CardDescription = ({ children, className = "", ...props }: CardDescriptionProps) => (
  <p
    {...props}
    className={cn("mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400", className)}
  >
    {children}
  </p>
);

/* =========================================================
   BODY
========================================================= */

export const CardBody = ({ children, className = "", ...props }: SectionProps) => (
  <div {...props} className={cn("px-6 py-5", className)}>
    {children}
  </div>
);

/* =========================================================
   FOOTER
========================================================= */

export const CardFooter = ({ children, className = "", ...props }: SectionProps) => (
  <div
    {...props}
    className={cn(
      "flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-900/50 backdrop-blur-sm",
      className,
    )}
  >
    {children}
  </div>
);

/* =========================================================
   MEDIA
========================================================= */

interface CardMediaProps extends HTMLAttributes<HTMLDivElement> {
  src: string;
  alt?: string;
  height?: string;
}

export const CardMedia = ({ src, alt = "card-image", className = "", height = "h-52", ...props }: CardMediaProps) => (
  <div {...props} className={cn("relative overflow-hidden", height, className)}>
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
    />
    <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent" />
  </div>
);

/* =========================================================
   ACTIONS
========================================================= */

export const CardActions = ({ children, className = "", ...props }: SectionProps) => (
  <div {...props} className={cn("flex items-center gap-2", className)}>
    {children}
  </div>
);

export default Card;
