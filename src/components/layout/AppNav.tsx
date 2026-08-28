"use client";

import { useState } from "react";
import { SideMenu } from "@/components/layout/SideMenu";
import { Skeleton } from "@/components/Skeleton";

/**
 * The hamburger, which is also the close control: the three bars fold
 * into an X rather than being swapped for a different icon, so the
 * button reads as one thing in two states instead of two buttons in the
 * same place.
 *
 * transform-box: view-box makes transform-origin resolve against the
 * 20x20 viewBox rather than each bar's own (zero-height) box, which is
 * what lets both arms rotate about the same centre.
 */
function MenuGlyph({ open }: { open: boolean }) {
  const arm = (rotate: number, shift: number) => ({
    transformBox: "view-box" as const,
    transformOrigin: "center",
    transform: open ? `rotate(${rotate}deg) translateY(${shift}px)` : "none",
    transition: "transform 260ms cubic-bezier(0.16, 0.9, 0.28, 1)",
  });

  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
      <rect x="3" y="5.25" width="14" height="1.5" rx="0.75" style={arm(45, 4)} />
      <rect
        x="3"
        y="9.25"
        width="14"
        height="1.5"
        rx="0.75"
        style={{
          opacity: open ? 0 : 1,
          transition: "opacity 160ms ease-out",
        }}
      />
      <rect x="3" y="13.25" width="14" height="1.5" rx="0.75" style={arm(-45, -4)} />
    </svg>
  );
}

/**
 * The top bar. Everything that is *about the account* rather than about
 * the page — switching workspace, who you are, logging out — lives in
 * the drawer now; what stays here is the way in, the product name, and
 * the current workspace as orientation only.
 */
export function AppNav({
  workspaceName,
  userEmail,
}: {
  workspaceName?: string;
  userEmail?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <header className="flex items-center gap-2.5 border-b border-border px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
          className="-ml-1 rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-accent"
        >
          <MenuGlyph open={isOpen} />
        </button>
        <span className="font-semibold tracking-wide text-accent">Maxwell</span>
        {workspaceName ? (
          <span className="min-w-0 truncate text-sm text-text-faint">
            <span aria-hidden="true" className="mr-2">
              ·
            </span>
            {workspaceName}
          </span>
        ) : (
          <Skeleton className="h-4 w-24" />
        )}
      </header>

      <SideMenu
        open={isOpen}
        onOpenChange={setIsOpen}
        workspaceName={workspaceName}
        userEmail={userEmail}
      />
    </>
  );
}
