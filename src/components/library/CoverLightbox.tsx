"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { useBackToClose } from "@/hooks/useBackToClose";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { usePullToDismiss } from "@/hooks/usePullToDismiss";

/**
 * A book's cover, as large as the screen allows, over everything else.
 *
 * Every way out of a photo viewer works: tap anywhere, Escape, the back
 * gesture, or pull it down on a phone. Nothing on it is a control, so
 * there is nothing to aim at.
 */
export function CoverLightbox({
  source,
  title,
  onClose,
}: {
  source: string;
  title: string;
  onClose: () => void;
}) {
  const imageRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useBackToClose(true, onClose);
  useEscapeKey(onClose, true, { exclusive: true });
  usePullToDismiss({ sheetRef: imageRef, backdropRef, onDismiss: onClose });

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`「${title}」の表紙`}
      className="fixed inset-0 z-[90] flex cursor-zoom-out items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="modal-backdrop absolute inset-0 bg-black/90"
      />
      <div
        ref={imageRef}
        className="lib-zoom relative flex max-h-full flex-col items-center gap-3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- an
            external cover, already the size it is going to be */}
        <img
          src={source}
          alt={`「${title}」の表紙`}
          referrerPolicy="no-referrer"
          className="max-h-[78dvh] max-w-[88vw] rounded-md object-contain shadow-[0_30px_90px_rgba(0,0,0,0.8)] sm:max-w-[min(88vw,32rem)]"
        />
        <p className="max-w-[88vw] text-center text-sm text-white/80">
          {title}
        </p>
      </div>
    </div>,
    document.body,
  );
}
