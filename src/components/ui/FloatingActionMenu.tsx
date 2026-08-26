"use client";

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface FloatingActionMenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
}

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

/** A viewport-level menu that cannot be clipped by a table or card. */
export function FloatingActionMenu({
  open,
  anchorRef,
  onClose,
  children,
  width = 192,
  className,
}: FloatingActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    const anchorRect = anchor.getBoundingClientRect();
    const menuHeight = menu.getBoundingClientRect().height;
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
    const left = Math.min(Math.max(VIEWPORT_MARGIN, anchorRect.right - width), maxLeft);
    const spaceBelow = window.innerHeight - anchorRect.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
    const spaceAbove = anchorRect.top - ANCHOR_GAP - VIEWPORT_MARGIN;
    const openAbove = menuHeight > spaceBelow && spaceAbove > spaceBelow;
    const preferredTop = openAbove
      ? anchorRect.top - ANCHOR_GAP - menuHeight
      : anchorRect.bottom + ANCHOR_GAP;
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - menuHeight - VIEWPORT_MARGIN);

    menu.style.left = `${left}px`;
    menu.style.top = `${Math.min(Math.max(VIEWPORT_MARGIN, preferredTop), maxTop)}px`;
    menu.style.visibility = "visible";
  }, [anchorRef, open, width]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchorRef.current?.contains(target)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        anchorRef.current?.focus();
      }
    };
    const handleViewportChange = () => onClose();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [anchorRef, onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ position: "fixed", left: 0, top: 0, visibility: "hidden", width }}
      className={cn(
        "z-[100] max-h-[calc(100vh-1rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

export default FloatingActionMenu;
