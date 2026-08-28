"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StoryLink } from "@/repositories/story.repository";
import { logoutAction } from "@/features/auth/actions";
import { storySwitchHref } from "@/features/story/switch-href";
import { Skeleton } from "@/components/Skeleton";
import { MotionToggle } from "@/components/MotionToggle";
import { STORY_STATUS_INK } from "@/components/story/status";
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
 * The workspace's stories, as a list of places to go.
 *
 * Named only — a dot for the state and the title — because this is a
 * way of getting somewhere, not a second stories page. Anything more
 * (how far along, what is ready) is what the cards on that page are
 * for, and putting it here would make the drawer a place you read
 * rather than a place you pass through.
 */
function StoryLinks({
  stories,
  isLoading,
  currentStoryId,
  pathname,
  onNavigate,
}: {
  stories?: StoryLink[] | null;
  isLoading: boolean;
  currentStoryId?: string;
  pathname: string;
  onNavigate: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-3 py-1">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-28" />
      </div>
    );
  }

  if (!stories) return null;

  if (stories.length === 0) {
    return (
      <p className="px-3 py-1 text-xs text-text-faint">No stories yet.</p>
    );
  }

  return (
    <ul className="flex flex-col">
      {stories.map((story) => {
        const isCurrent = story.id === currentStoryId;
        return (
          <li key={story.id}>
            <Link
              href={storySwitchHref(story.id, pathname)}
              onClick={onNavigate}
              aria-current={isCurrent ? "page" : undefined}
              title={story.title}
              className={`mx-1.5 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isCurrent
                  ? "bg-accent-soft text-accent"
                  : "text-text-muted hover:bg-surface-hover hover:text-text"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${
                  isCurrent ? "" : STORY_STATUS_INK[story.status]
                }`}
              />
              <span className="min-w-0 truncate">{story.title}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The app's drawer: everything about *where you are and who you are* —
 * workspace, navigation, account — in one surface, so the header can
 * stay out of the content's way.
 *
 * It carries the workspace's stories too, so switching between them is
 * one press from inside one of them rather than a trip out to the list
 * and back in. They sit under the Stories link, which still leads to
 * the full list — the drawer names stories, the page is where you
 * filter, create and settle them.
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
  stories,
  isLoadingStories = false,
  currentStoryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName?: string;
  userEmail?: string;
  /** null until the first load has answered. */
  stories?: StoryLink[] | null;
  isLoadingStories?: boolean;
  currentStoryId?: string;
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

  if (typeof document === "undefined") return null;

  /*
   * Portalled to the body rather than left where the button is.
   *
   * The button now sits inside the story header, which is a flex item
   * carrying a z-index and so is a stacking context of its own — a
   * drawer rendered inside it could not rise above the task panel two
   * containers away, however high its own z-index went. An overlay
   * covering the whole screen belongs to the whole screen.
   */
  return createPortal(
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

          {/* The one part that can outgrow the drawer, so it is the one
              part that scrolls. Everything below stays put — and the
              two destinations stay at the top of it, above however many
              stories there turn out to be. */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <nav className="flex flex-col gap-0.5 px-1.5">
              {NAV_ITEMS.map(({ href, label, Icon }) => {
                // On a story page the Stories link is not where you
                // are — the story named below it is — so being under
                // /stories is not enough to claim the highlight.
                const isActive =
                  pathname.startsWith(href) &&
                  !(currentStoryId && href === "/stories");
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

            {(isLoadingStories || stories) && (
              <div className="flex flex-col gap-1.5">
                <SectionLabel>Switch story</SectionLabel>
                <StoryLinks
                  stories={stories}
                  isLoading={isLoadingStories}
                  currentStoryId={currentStoryId}
                  pathname={pathname}
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionLabel>Motion</SectionLabel>
            <MotionToggle />
          </div>

          <div className="flex flex-col gap-1.5">
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
    </>,
    document.body,
  );
}
