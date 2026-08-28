"use client";

import { usePathname } from "next/navigation";
import {
  BoardIcon,
  GraphViewIcon,
  ListIcon,
  StoriesIcon,
} from "@/components/icons";
import { TabBar } from "@/components/ui/TabBar";

const VIEWS = [
  { segment: "", label: "Graph", Icon: GraphViewIcon },
  { segment: "/list", label: "List", Icon: ListIcon },
  { segment: "/board", label: "Board", Icon: BoardIcon },
] as const;

/**
 * The same story, three ways to look at it — and, on a phone, the way
 * back to the list of them.
 *
 * That fourth tab exists only in the bottom bar. Up top there is a
 * "← Stories" link right next to the title, and a second way out three
 * inches away would be one too many. At the bottom there isn't one: the
 * back arrow is a small target in the far corner of a phone, which is
 * the corner a thumb reaches last. A bar that can move between a
 * story's views but not out of the story is half a navigation.
 *
 * It leads rather than follows the three views, because it is the level
 * above them — the same order the back arrow and the title sit in up
 * top, read left to right.
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
      tabs={
        placement === "bottom"
          ? [
              {
                key: "Stories",
                href: "/stories",
                label: "Stories",
                // Never active: leaving here means leaving this bar
                // behind, so marking it would claim a destination the
                // bar cannot be showing.
                isActive: false,
                icon: <StoriesIcon />,
              },
              ...views,
            ]
          : views
      }
    />
  );
}
