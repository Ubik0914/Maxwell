/** The three ways a story can be looked at, as URL segments. */
const VIEWS = ["list", "board"] as const;

/**
 * Where to go to see another story — in the view you are already in.
 *
 * Switching stories from the board and landing on the graph would be
 * two changes for one decision: you asked for a different story, not a
 * different way of reading one. So the view segment is carried across,
 * and anywhere else (the stories list itself, a settings page) starts
 * at the graph, which is the story's own front door.
 *
 * Only the views that exist are carried. Anything else in that position
 * is not a view this app has, and following it would produce a 404 out
 * of a menu press.
 *
 * "all" — every story on one graph, list or board — sits in the same
 * place in the path as a story id and is switched to the same way, so
 * the drawer's All stories row goes through here too.
 */
export function storySwitchHref(storyId: string, pathname: string): string {
  const segments = pathname.split("/");
  // ["", "stories", "<id>", "<view>"]
  const view = segments.length === 4 && segments[1] === "stories"
    ? segments[3]
    : undefined;

  return (VIEWS as readonly string[]).includes(view ?? "")
    ? `/stories/${storyId}/${view}`
    : `/stories/${storyId}`;
}
