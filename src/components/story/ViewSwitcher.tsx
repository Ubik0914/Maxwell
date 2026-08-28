"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BoardIcon,
  GraphViewIcon,
  ListIcon,
} from "@/components/icons";

const VIEWS = [
  { segment: "", label: "Graph", Icon: GraphViewIcon },
  { segment: "/list", label: "List", Icon: ListIcon },
  { segment: "/board", label: "Board", Icon: BoardIcon },
] as const;

/**
 * The same story, three ways to look at it.
 *
 * A segmented control rather than tabs, because these are not sections
 * of the story — they are lenses on all of it, and switching lens should
 * feel like turning something rather than navigating somewhere. They are
 * real links, so each view has a URL you can send to someone, and the
 * back button does what it should.
 *
 * The active segment is read from the pathname rather than passed down,
 * which keeps the header a Server Component and stops three pages having
 * to remember to say which one they are.
 */
export function ViewSwitcher({ storyId }: { storyId: string }) {
  const pathname = usePathname();
  const base = `/stories/${storyId}`;

  return (
    <nav
      aria-label="Story view"
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
    >
      {VIEWS.map(({ segment, label, Icon }) => {
        const href = `${base}${segment}`;
        const isActive = pathname === href;
        return (
          <Link
            key={label}
            href={href}
            title={label}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              isActive
                ? "bg-accent-soft text-accent"
                : "text-text-faint hover:bg-surface-hover hover:text-text"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
