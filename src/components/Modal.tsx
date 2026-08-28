"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";

/**
 * The one way this app puts something in front of the graph.
 *
 * It always portals to document.body. Inside the story view the graph
 * canvas, its viewport, and the page-enter animation all carry CSS
 * transforms, and a transformed ancestor becomes the containing block
 * for its position: fixed descendants — an overlay left in that subtree
 * resolves "fixed inset-0" against the panned/zoomed graph layer
 * instead of the browser viewport, so it renders off-center, clipped,
 * and drifting as the canvas moves. Portaling out of that subtree is
 * the only thing that fixes it, so no caller gets to forget.
 *
 * Escape handling stays with the caller (useEscapeKey), because
 * layered surfaces need to decide among themselves which one Escape
 * closes.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  // No portal target during SSR. Every caller mounts this in response to
  // a click, so there is no first client render for it to disagree with
  // and no hydration mismatch to create.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel w-full ${width} rounded-xl border border-border bg-surface p-6 shadow-[0_24px_70px_rgba(0,0,0,0.65)]`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-text-faint">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1.5 shrink-0 rounded-full p-1.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
