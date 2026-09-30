"use client";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";
import { useBackToClose } from "@/hooks/useBackToClose";
import { usePullToDismiss } from "@/hooks/usePullToDismiss";

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
  fullScreenOnMobile = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  /**
   * On a phone, be a page rather than a card floating over one: the
   * whole screen, a fixed header, the body scrolling under it, and room
   * left for the notch and the home indicator. From `sm` up it is the
   * ordinary centred dialog.
   */
  fullScreenOnMobile?: boolean;
}) {
  // A full page is left with the back gesture, like any page. The
  // centred dialogs Maxwell uses are not pages and keep back for
  // navigation.
  useBackToClose(fullScreenOnMobile, onClose);

  // And, being a sheet on a phone, it is pulled down to close.
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  usePullToDismiss({
    sheetRef,
    scrollRef,
    backdropRef,
    onDismiss: onClose,
    enabled: fullScreenOnMobile,
  });

  // No portal target during SSR. Every caller mounts this in response to
  // a click, so there is no first client render for it to disagree with
  // and no hydration mismatch to create.
  if (typeof document === "undefined") return null;

  if (fullScreenOnMobile) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-end justify-center pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:items-center sm:px-4 sm:pt-0">
        {/* The dimming is its own layer, so a pull can lift it off
            without fading the sheet along with it. */}
        <div
          ref={backdropRef}
          aria-hidden="true"
          className="modal-backdrop absolute inset-0 bg-black/70"
          onMouseDown={onClose}
        />
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`modal-panel modal-page relative flex h-full w-full ${width} flex-col overflow-hidden rounded-t-2xl bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.5)] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl sm:border sm:border-border sm:shadow-[0_24px_70px_rgba(0,0,0,0.65)]`}
        >
          {/* The grabber: says "this pulls down" the way iOS does. */}
          <div
            aria-hidden="true"
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border-strong sm:hidden"
          />
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 pt-1 pb-3 sm:items-start sm:border-0 sm:px-6 sm:pt-6 sm:pb-0">
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
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-surface-hover hover:text-text sm:-m-1.5 sm:h-auto sm:w-auto sm:p-1.5"
            >
              <CloseIcon className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          </div>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6"
          >
            {children}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel max-h-[calc(100dvh-2rem)] w-full ${width} overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-[0_24px_70px_rgba(0,0,0,0.65)]`}
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
            className="-m-2.5 shrink-0 rounded-full p-2.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text sm:-m-1.5 sm:p-1.5"
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
