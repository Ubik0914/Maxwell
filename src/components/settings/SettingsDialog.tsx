"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/features/auth/actions";
import { MotionToggle } from "@/components/MotionToggle";
import { BetaToggle } from "@/components/BetaToggle";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import {
  ArrowLeftIcon,
  BookIcon,
  CloseIcon,
  MembersIcon,
} from "@/components/icons";

/**
 * Settings, off the drawer.
 *
 * These lived at the bottom of the drawer, under the stories, and they
 * are all short — a nav row, two toggles, an address and a log out. But
 * short is not the same as small: together they held about half the
 * height of a phone, and the stories, which are what the drawer is
 * actually for, were left with three rows and a fourth cut in half.
 * A list you scroll to see three of is a list that has been pushed
 * aside by things you touch once a month.
 *
 * A screen on a phone and a window on a desktop, which is the same
 * shape TaskPanel takes and for the same reason: on a small screen
 * there is no "beside", so a surface either takes the screen or fights
 * for it, and on a large one taking the whole screen for four rows
 * would throw away the context somebody opened it from.
 *
 * It takes Escape exclusively. It is opened from the drawer, which is
 * listening too, and one press should put away one thing.
 */
export function SettingsDialog({
  userEmail,
  onClose,
  onNavigate,
}: {
  userEmail?: string;
  onClose: () => void;
  /** Went somewhere — the drawer behind this should go too. */
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  useEscapeKey(onClose, true, { exclusive: true });

  // No portal target during SSR, and this only ever mounts on a press,
  // so there is no first client render for it to disagree with.
  if (typeof document === "undefined") return null;

  const isMembersActive = pathname.startsWith("/settings/members");
  const isDocsActive = pathname.startsWith("/docs");

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[70] flex bg-black/70 sm:items-center sm:justify-center sm:px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="modal-panel flex w-full flex-col bg-surface sm:max-h-[85vh] sm:max-w-lg sm:rounded-xl sm:border sm:border-border sm:shadow-[0_24px_70px_rgba(0,0,0,0.65)]"
      >
        {/* Two ways out, one per shape, and they sit where each shape
            puts them. On a phone this is a screen you came to, so it
            leads with a back arrow. On a desktop it is a window over
            what you were already looking at, so it closes from the
            corner, like every other window in this app. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="-m-1.5 shrink-0 rounded-full p-1.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text sm:hidden"
          >
            <ArrowLeftIcon />
          </button>
          <h2 className="text-base font-semibold text-text">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1.5 ml-auto hidden shrink-0 rounded-full p-1.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text sm:block"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Workspace</SectionLabel>
            <Link
              href="/settings/members"
              onClick={onNavigate}
              aria-current={isMembersActive ? "page" : undefined}
              className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface-hover hover:text-text"
            >
              <MembersIcon />
              Members
            </Link>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionLabel>Help</SectionLabel>
            <Link
              href="/docs"
              onClick={onNavigate}
              aria-current={isDocsActive ? "page" : undefined}
              className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface-hover hover:text-text"
            >
              <BookIcon />
              使い方
            </Link>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionLabel>Motion</SectionLabel>
            <MotionToggle />
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionLabel>Beta</SectionLabel>
            <BetaToggle />
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionLabel>Account</SectionLabel>
            {userEmail && (
              <p className="truncate text-sm text-text-muted">{userEmail}</p>
            )}
            <form action={logoutAction}>
              <button
                type="submit"
                className="-mx-2 w-full rounded-lg px-2 py-1.5 text-left text-sm text-text-faint transition-colors hover:bg-surface-hover hover:text-danger"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
