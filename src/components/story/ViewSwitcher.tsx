"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoardIcon, GraphViewIcon, ListIcon } from "@/components/icons";

const VIEWS = [
  { segment: "", label: "Graph", Icon: GraphViewIcon },
  { segment: "/list", label: "List", Icon: ListIcon },
  { segment: "/board", label: "Board", Icon: BoardIcon },
] as const;

/**
 * The same story, three ways to look at it.
 *
 * A full-width tab bar under the title, the way every app that has to
 * offer this on a phone does it. It was a compact segmented pill
 * squeezed in beside the counters, which made three of the app's five
 * screens into a control the width of a thumb — and pushed the counters
 * onto a second line to do it.
 *
 * They are real links, so each view has a URL you can send to someone
 * and the back button does what it should. The active one is marked
 * with a lit rule rather than a filled background: it is the same
 * language the graph uses for a live conduit, and it leaves the tab
 * itself uncoloured so three tabs read as one row rather than as one
 * button and two labels.
 *
 * The active segment is read from the pathname rather than passed down,
 * which keeps the header a Server Component and stops three pages
 * having to remember to say which one they are.
 */
export function ViewSwitcher({ storyId }: { storyId: string }) {
  const pathname = usePathname();
  const base = `/stories/${storyId}`;

  return (
    <nav aria-label="Story view" className="flex w-full items-stretch">
      {VIEWS.map(({ segment, label, Icon }) => {
        const href = `${base}${segment}`;
        const isActive = pathname === href;
        return (
          <Link
            key={label}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              isActive
                ? "text-accent"
                : "text-text-faint hover:bg-surface-hover hover:text-text"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 mx-auto h-0.5 w-14 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
