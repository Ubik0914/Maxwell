import type { ReactNode } from "react";
import Link from "next/link";

export interface TabSpec {
  key: string;
  href: string;
  label: string;
  isActive: boolean;
  /** Optional mark before the label — an icon, a status dot. */
  icon?: ReactNode;
}

/**
 * A row of sibling destinations, in the shape the screen calls for.
 *
 * Two placements, because a phone and a desktop disagree about where a
 * tab bar goes and both are right. On a wide screen it sits under the
 * heading, where the eye already is. On a phone it sits at the bottom,
 * where the thumb already is — which is where every app that has to
 * offer this on a phone has ended up putting it, and the reason the
 * targets there are nearly twice the height of the ones up top.
 *
 * The active one is marked with a lit rule rather than a filled
 * background: it is the same language the graph uses for a live
 * conduit, and it leaves the tab itself uncoloured so a row of tabs
 * reads as one row rather than as one button and some labels. The rule
 * sits on the edge facing the content — under the tab up top, over it
 * at the bottom — so it always points at what it is describing.
 *
 * Which tab is active is the caller's to decide: one row is answering
 * "which URL am I on", another "which filter is applied", and neither
 * belongs in here.
 */
export function TabBar({
  label,
  tabs,
  placement = "top",
  className = "",
}: {
  /** Names the row for assistive tech — there is more than one. */
  label: string;
  tabs: TabSpec[];
  placement?: "top" | "bottom";
  className?: string;
}) {
  const isBottom = placement === "bottom";

  return (
    <nav aria-label={label} className={`flex w-full items-stretch ${className}`}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.isActive ? "page" : undefined}
          className={`view-tab relative flex flex-1 items-center justify-center transition-colors ${
            isBottom
              ? "flex-col gap-1 py-2.5 text-[11px] font-medium"
              : "gap-1.5 py-2.5 text-xs font-medium"
          } ${
            tab.isActive
              ? "text-accent"
              : "text-text-faint hover:bg-surface-hover hover:text-text"
          }`}
        >
          {tab.icon}
          {tab.label}
          {tab.isActive && (
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 mx-auto h-0.5 w-14 rounded-full bg-accent shadow-[0_0_8px_var(--accent)] ${
                isBottom ? "top-0" : "bottom-0"
              }`}
            />
          )}
        </Link>
      ))}
    </nav>
  );
}
