"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/features/auth/actions";
import { Skeleton } from "@/components/Skeleton";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useDrawerDrag } from "@/components/layout/useDrawerDrag";
import { CloseIcon, MembersIcon, StoriesIcon } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/stories", label: "Stories", Icon: StoriesIcon },
  { href: "/settings/members", label: "Members", Icon: MembersIcon },
];

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
 * It can be dragged as well as toggled; the gesture arithmetic lives in
 * useDrawerDrag. The grab strip that starts an opening drag exists only
 * on touch devices: on the story graph it sits over the canvas, and
 * taking a slice of the pane away from a mouse user to serve a gesture
 * they cannot make would be a straight loss.
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
  const { panelRef, drag, handlers } = useDrawerDrag({ onSettle: onOpenChange });

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

  return (
    <>
      {!open && (
        <div
          aria-hidden="true"
          {...handlers("edge")}
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
          style={
            drag ? { opacity: drag.progress, transition: "none" } : undefined
          }
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          ref={panelRef}
          aria-label="Main menu"
          aria-hidden={!open && !drag}
          {...handlers("panel")}
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
          className={`drawer-panel absolute inset-y-0 left-0 flex w-72 max-w-[84vw] touch-pan-y flex-col gap-5 border-r border-border bg-surface py-4 shadow-[8px_0_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out ${
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
            {NAV_ITEMS.map(({ href, label, Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => onOpenChange(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-accent-soft text-accent"
                      : "text-text-muted hover:bg-surface-hover hover:text-text"
                  }`}
                >
                  <Icon />
                  {label}
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
