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
 * Two placements, because a phone and a desktop disagree about where a
 * tab bar goes and both are right. On a wide screen it sits under the
 * title, where the eye already is. On a phone it sits at the bottom,
 * where the thumb already is — which is where every app that has to
 * offer this on a phone has ended up putting it, and the reason the
 * targets there are twice the height of the ones up top.
 *
 * They are real links, so each view has a URL you can send to someone
 * and the back button does what it should. The active one is marked
 * with a lit rule rather than a filled background: it is the same
 * language the graph uses for a live conduit, and it leaves the tab
 * itself uncoloured so three tabs read as one row rather than as one
 * button and two labels. The rule sits on the edge facing the content
 * — under the tab up top, over it at the bottom — so it always points
 * at what it is describing.
 *
 * The active segment is read from the pathname rather than passed down,
 * which keeps the header a Server Component and stops three pages
 * having to remember to say which one they are.
 */
export function ViewSwitcher({
  storyId,
  placement = "top",
  className = "",
}: {
  storyId: string;
  placement?: "top" | "bottom";
  className?: string;
}) {
  const pathname = usePathname();
  const base = `/stories/${storyId}`;
  const isBottom = placement === "bottom";

  return (
    <nav
      aria-label="Story view"
      className={`flex w-full items-stretch ${className}`}
    >
      {VIEWS.map(({ segment, label, Icon }) => {
        const href = `${base}${segment}`;
        const isActive = pathname === href;
        return (
          <Link
            key={label}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`view-tab relative flex flex-1 items-center justify-center transition-colors ${
              isBottom
                ? "flex-col gap-1 py-2.5 text-[11px] font-medium"
                : "gap-1.5 py-2.5 text-xs font-medium"
            } ${
              isActive
                ? "text-accent"
                : "text-text-faint hover:bg-surface-hover hover:text-text"
            }`}
          >
            <Icon />
            {label}
            {isActive && (
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 mx-auto h-0.5 w-14 rounded-full bg-accent shadow-[0_0_8px_var(--accent)] ${
                  isBottom ? "top-0" : "bottom-0"
                }`}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
