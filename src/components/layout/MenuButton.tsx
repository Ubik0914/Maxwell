"use client";

import { useState } from "react";
import type { StoryLink } from "@/repositories/story.repository";
import { listStoryLinksAction } from "@/features/story/actions";
import { SideMenu } from "@/components/layout/SideMenu";

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
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="h-5 w-5"
    >
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
      <rect
        x="3"
        y="13.25"
        width="14"
        height="1.5"
        rx="0.75"
        style={arm(-45, -4)}
      />
    </svg>
  );
}

/**
 * The way into the drawer, and the drawer with it.
 *
 * It is its own component because there are two places you can be in
 * this app: on a page with the ordinary top bar, and inside a story,
 * where the screen is the graph and there is no room for one. Both need
 * the same button opening the same drawer, so neither owns it.
 *
 * The story list is fetched when the drawer opens, not when the page
 * renders — see listStoryLinksAction. Opening is also draggable from
 * the screen edge, which is why the fetch hangs off `setOpen` rather
 * than off this button's own click: both ways in go through here.
 */
export function MenuButton({
  workspaceId,
  workspaceName,
  userEmail,
  currentStoryId,
  className = "",
}: {
  workspaceId?: string;
  workspaceName?: string;
  userEmail?: string;
  /** Marks the story you are already in, where there is one. */
  currentStoryId?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [stories, setStories] = useState<StoryLink[] | null>(null);
  const [isLoadingStories, setIsLoadingStories] = useState(false);

  function setOpen(next: boolean) {
    setIsOpen(next);
    if (!next || !workspaceId) return;

    // Re-read every time it opens. The last list is kept on screen
    // while it happens, so reopening shows what was there rather than
    // a skeleton where the names just were.
    setIsLoadingStories(true);
    void listStoryLinksAction(workspaceId).then((result) => {
      if (result.success) setStories(result.data);
      setIsLoadingStories(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        className={`rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-accent ${className}`}
      >
        <MenuGlyph open={isOpen} />
      </button>

      <SideMenu
        open={isOpen}
        onOpenChange={setOpen}
        workspaceName={workspaceName}
        userEmail={userEmail}
        stories={stories}
        isLoadingStories={isLoadingStories && stories === null}
        currentStoryId={currentStoryId}
      />
    </>
  );
}
