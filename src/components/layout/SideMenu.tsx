"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/features/auth/actions";
import { Skeleton } from "@/components/Skeleton";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { CloseIcon } from "@/components/icons";

/** Where the panel has to reach before a release counts as "open". */
const SETTLE_RATIO = 0.5;
/** Fallback width for the first gesture, before the panel is measured. */
const ASSUMED_WIDTH = 288;

function StoriesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <circle cx="4" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 9.2 14 5M6 10.8l8 5.2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function MembersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <circle cx="7" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.5 16c.6-3 2.2-4.5 4.5-4.5s3.9 1.5 4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="14.5" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12.5 11.2c1.9.3 3.1 1.6 3.6 4.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-3 text-[10px] font-semibold tracking-[0.16em] text-text-faint uppercase">
      {children}
    </p>
  );
}

/**
 * The app's drawer: everything about *where you are and who you are* —
 * workspace, navigation, account — in one surface, so the header can
 * stay out of the content's way.
 *
 * It can be dragged as well as toggled. A thin grab strip along the
 * screen edge starts an opening drag, the panel itself starts a closing
 * one, and in both cases the panel tracks the finger and settles to
 * whichever side it was nearer on release. That strip only exists on
 * touch devices: on the story graph it sits over the canvas, and taking
 * a slice of the pane away from a mouse user to serve a gesture they
 * cannot make would be a straight loss.
 *
 * `touch-action` does the work `preventDefault` normally would — React
 * attaches touch listeners passively, so the declarative form is the
 * one that actually holds.
 */
export function SideMenu({
  open,
  onOpenChange,
  workspaceName,
  userEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName?: string;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLElement>(null);
  const gesture = useRef<{ startX: number; from: number } | null>(null);
  // Non-null only mid-drag; while it is set, inline styles take over
  // from the CSS classes so the panel follows the finger exactly.
  const [drag, setDrag] = useState<{ x: number; progress: number } | null>(
    null,
  );

  useEscapeKey(() => onOpenChange(false), open);

  // The page behind a drawer shouldn't scroll out from under it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function width() {
    return panelRef.current?.offsetWidth || ASSUMED_WIDTH;
  }

  function beginDrag(event: TouchEvent, from: "edge" | "panel") {
    const touch = event.touches[0];
    if (!touch) return;
    const origin = from === "edge" ? -width() : 0;
    gesture.current = { startX: touch.clientX, from: origin };
    setDrag({ x: origin, progress: from === "edge" ? 0 : 1 });
  }

  function moveDrag(event: TouchEvent) {
    const active = gesture.current;
    const touch = event.touches[0];
    if (!active || !touch) return;

    const span = width();
    const x = Math.min(0, Math.max(-span, active.from + touch.clientX - active.startX));
    setDrag({ x, progress: 1 + x / span });
  }

  function endDrag() {
    if (!gesture.current) return;
    const settled = (drag?.progress ?? 0) > SETTLE_RATIO;
    gesture.current = null;
    setDrag(null);
    onOpenChange(settled);
  }

  const navItems = [
    { href: "/stories", label: "Stories", icon: <StoriesIcon /> },
    { href: "/settings/members", label: "Members", icon: <MembersIcon /> },
  ];

  return (
    <>
      {/* Touch-only grab strip along the screen edge. */}
      {!open && (
        <div
          aria-hidden="true"
          onTouchStart={(event) => beginDrag(event, "edge")}
          onTouchMove={moveDrag}
          onTouchEnd={endDrag}
          onTouchCancel={endDrag}
          className="fixed inset-y-0 left-0 z-40 w-5 touch-none [@media(hover:hover)]:hidden"
        />
      )}

      <div
        className={`fixed inset-0 z-50 ${
          open || drag ? "" : "pointer-events-none"
        }`}
      >
        <div
          onClick={() => onOpenChange(false)}
          style={drag ? { opacity: drag.progress, transition: "none" } : undefined}
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          ref={panelRef}
          aria-label="Main menu"
          aria-hidden={!open && !drag}
          onTouchStart={(event) => beginDrag(event, "panel")}
          onTouchMove={moveDrag}
          onTouchEnd={endDrag}
          onTouchCancel={endDrag}
          style={
            drag
              ? { transform: `translateX(${drag.x}px)`, transition: "none" }
              : undefined
          }
          // The resting positions are classes so they animate through
          // CSS, but Tailwind v4 renders them as the `translate`
          // property — which an inline `transform` cannot override. So
          // the class comes off entirely for the duration of a drag,
          // and the inline transform is the only thing positioning it.
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[84vw] touch-pan-y flex-col gap-5 border-r border-border bg-surface py-4 shadow-[8px_0_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out ${
            drag ? "" : open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-3">
            <span className="font-semibold tracking-wide text-accent">
              Maxwell
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close menu"
              className="rounded-full p-1.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionLabel>Workspace</SectionLabel>
            {workspaceName ? (
              <Link
                href="/workspaces"
                onClick={() => onOpenChange(false)}
                className="mx-1.5 flex items-center justify-between gap-2 rounded-lg px-1.5 py-2 transition-colors hover:bg-surface-hover"
              >
                <span className="truncate text-sm text-text">
                  {workspaceName}
                </span>
                <span className="shrink-0 text-[11px] text-text-faint">
                  Switch
                </span>
              </Link>
            ) : (
              <Skeleton className="mx-3 h-5 w-32" />
            )}
          </div>

          <nav className="flex flex-col gap-0.5 px-1.5">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onOpenChange(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-accent-soft text-accent"
                      : "text-text-muted hover:bg-surface-hover hover:text-text"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-1.5">
            <SectionLabel>Account</SectionLabel>
            {userEmail ? (
              <p className="truncate px-3 text-sm text-text-muted">
                {userEmail}
              </p>
            ) : (
              <Skeleton className="mx-3 h-4 w-40" />
            )}
            <form action={logoutAction} className="px-1.5">
              <button
                type="submit"
                className="w-full rounded-lg px-1.5 py-2 text-left text-sm text-text-faint transition-colors hover:bg-surface-hover hover:text-danger"
              >
                Log out
              </button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
