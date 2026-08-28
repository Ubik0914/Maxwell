"use client";

import { usePathname } from "next/navigation";
import { BoardIcon, GraphViewIcon, ListIcon } from "@/components/icons";
import { TabBar } from "@/components/ui/TabBar";

const VIEWS = [
  { segment: "", label: "Graph", Icon: GraphViewIcon },
  { segment: "/list", label: "List", Icon: ListIcon },
  { segment: "/board", label: "Board", Icon: BoardIcon },
] as const;

/**
 * The same story, three ways to look at it.
 *
 * It carried a fourth tab to the stories list, back when that was a
 * page. It isn't one now — the stories live in the drawer, which opens
 * from the header button and, on a phone, from a drag off the left
 * edge. A tab leading to a route that only redirects would send you
 * somewhere you didn't ask to go.
 *
 * Real links throughout, so each view has a URL you can send to someone
 * and the back button does what it should. Which one is active is read
 * from the pathname rather than passed down, which keeps the header a
 * Server Component and stops three pages having to remember to say
 * which one they are — the one thing here that TabBar can't decide for
 * itself.
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

  const views = VIEWS.map(({ segment, label, Icon }) => ({
    key: label,
    href: `${base}${segment}`,
    label,
    isActive: pathname === `${base}${segment}`,
    icon: <Icon />,
  }));

  return (
    <TabBar
      label="Story view"
      placement={placement}
      className={className}
      tabs={views}
    />
  );
}
