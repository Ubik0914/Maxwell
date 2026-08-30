"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DrawerStories } from "@/features/story/actions";
import { logoutAction } from "@/features/auth/actions";
import {
  STORY_FILTER_ORDER,
  type StoryFilter,
} from "@/features/story/filter";
import { Skeleton } from "@/components/Skeleton";
import { MotionToggle } from "@/components/MotionToggle";
import { BetaToggle } from "@/components/BetaToggle";
import type { StoryListItem } from "@/repositories/story.repository";
import { CreateStoryDialog } from "@/components/story/CreateStoryDialog";
import { StoryRow } from "@/components/story/StoryRow";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useDrawerDrag } from "@/components/layout/useDrawerDrag";
import { CloseIcon, MembersIcon, PlusIcon } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/settings/members", label: "Members", Icon: MembersIcon },
];

const FILTER_LABEL: Record<StoryFilter, string> = {
  ALL: "All",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.16em] text-text-faint uppercase">
      {children}
    </p>
  );
}

/**
 * The workspace's stories.
 *
 * Each one is a row that says where it has got to and what can be done
 * about it — see StoryRow. This was a list of bare names for a while,
 * after the page of cards it replaced went away, and a menu that only
 * names stories can switch between them and nothing else.
 */
function StoryLinks({
  stories,
  now,
  isLoading,
  currentStoryId,
  pathname,
  onNavigate,
  onChanged,
}: {
  stories?: StoryListItem[] | null;
  now: string;
  isLoading: boolean;
  currentStoryId?: string;
  pathname: string;
  onNavigate: () => void;
  onChanged: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-3 py-2">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (!stories) return null;

  if (stories.length === 0) {
    return <p className="px-3 py-1 text-xs text-text-faint">Nothing here.</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {stories.map((story) => (
        <li key={story.id}>
          <StoryRow
            story={story}
            now={now}
            isCurrent={story.id === currentStoryId}
            pathname={pathname}
            onNavigate={onNavigate}
            onChanged={onChanged}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The app's drawer, which is now where stories are kept.
 *
 * There used to be a page of story cards to filter, browse and add to.
 * It was a screen you passed through on the way to the one you wanted
 * and then left, which is a page's worth of chrome for a decision that
 * is really just "which one" — so the whole of it (the filters, the
 * list, the New Story button) is here, and the app is always showing a
 * story rather than sometimes showing a list of them.
 *
 * The filters are state rather than URL, unlike the page they replace.
 * A filter here narrows a menu while it is open; it is not somewhere
 * you are, and it should not be somewhere the back button can take you.
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
  workspaceId,
  workspaceName,
  userEmail,
  stories,
  isLoadingStories = false,
  currentStoryId,
  onReload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
  workspaceName?: string;
  userEmail?: string;
  /** null until the first load has answered. */
  stories?: DrawerStories | null;
  isLoadingStories?: boolean;
  currentStoryId?: string;
  /** Read the list again — something in it changed. */
  onReload?: () => void;
}) {
  const pathname = usePathname();
  const { panelRef, drag, handlers } = useDrawerDrag({ onSettle: onOpenChange });
  /*
   * Whether there is a document to portal into.
   *
   * A bare `typeof document === "undefined"` would be right about the
   * server and wrong about hydration: the client's first render would
   * produce a portal where the server produced nothing, and React
   * throws away the whole server tree over the mismatch. Reading it as
   * an external store gives the hydration pass the server's answer and
   * the portal on the render after, which is what a portal that is
   * always mounted needs.
   */
  const isBrowser = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [filter, setFilter] = useState<StoryFilter>("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // No flag for what is layered over it any more: a dialog opened from
  // here takes the key exclusively (see useEscapeKey), which also
  // covers the ones the drawer never hears about, like a story's
  // settings three components down.
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

  if (!isBrowser) return null;

  const shown =
    stories && filter !== "ALL"
      ? stories.stories.filter((story) => story.status === filter)
      : (stories?.stories ?? null);

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
          className={`drawer-panel absolute inset-y-0 left-0 flex w-80 max-w-[88vw] touch-pan-y flex-col gap-4 border-r border-border bg-surface py-3 shadow-[8px_0_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out ${
            drag ? "" : open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* The product's own name used to sit here. It said nothing
              you didn't already know, on every screen, forever. */}
          <div className="flex justify-end px-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close menu"
              className="-m-1 rounded-full p-1.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="flex flex-col gap-1.5 px-3">
            <SectionLabel>Workspace</SectionLabel>
            {workspaceName ? (
              <Link
                href="/workspaces"
                onClick={() => onOpenChange(false)}
                className="-mx-1.5 flex items-center justify-between gap-2 rounded-lg px-1.5 py-2 transition-colors hover:bg-surface-hover"
              >
                <span className="truncate text-sm text-text">
                  {workspaceName}
                </span>
                <span className="shrink-0 text-[11px] text-text-faint">
                  Switch
                </span>
              </Link>
            ) : (
              <Skeleton className="h-5 w-32" />
            )}
          </div>

          {/* The stories: the one part that can outgrow the drawer, so
              the one part that scrolls. Its heading and filters stay
              put above it, and everything below stays put too. */}
          {workspaceId && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2 px-3">
                <SectionLabel>Stories</SectionLabel>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  aria-label="New story"
                  title="New story"
                  className="-m-1 rounded-full p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-accent"
                >
                  <PlusIcon />
                </button>
              </div>

              {/* Four filters do not fit across 288px, and wrapping them
                  costs a line of the list. They scroll instead, the way
                  the task filters do. */}
              <div className="scroll-x flex gap-1.5 px-3">
                {STORY_FILTER_ORDER.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      filter === value
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border text-text-muted hover:border-border-strong hover:text-text"
                    }`}
                  >
                    {FILTER_LABEL[value]}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <StoryLinks
                  stories={shown}
                  now={stories?.now ?? ""}
                  isLoading={isLoadingStories}
                  currentStoryId={currentStoryId}
                  pathname={pathname}
                  onNavigate={() => onOpenChange(false)}
                  onChanged={() => onReload?.()}
                />
              </div>
            </div>
          )}

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

          <div className="flex flex-col gap-1.5 px-3">
            <SectionLabel>Motion</SectionLabel>
            <MotionToggle />
          </div>

          <div className="flex flex-col gap-1.5 px-3">
            <SectionLabel>Beta</SectionLabel>
            <BetaToggle />
          </div>

          <div className="flex flex-col gap-1.5 px-3">
            <SectionLabel>Account</SectionLabel>
            {userEmail ? (
              <p className="truncate text-sm text-text-muted">{userEmail}</p>
            ) : (
              <Skeleton className="h-4 w-40" />
            )}
            <form action={logoutAction}>
              <button
                type="submit"
                className="-mx-1.5 w-full rounded-lg px-1.5 py-1.5 text-left text-sm text-text-faint transition-colors hover:bg-surface-hover hover:text-danger"
              >
                Log out
              </button>
            </form>
          </div>
        </aside>
      </div>

      {isCreateOpen && workspaceId && (
        <CreateStoryDialog
          workspaceId={workspaceId}
          onClose={() => setIsCreateOpen(false)}
        />
      )}
    </>,
    document.body,
  );
}
