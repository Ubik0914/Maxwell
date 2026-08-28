import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getGraph,
  type GraphResult,
} from "@/features/graph/services/graph-service";

/**
 * Everything the three story views need, loaded the same way for all of
 * them.
 *
 * Graph, list and board are one story seen three ways, so they must read
 * from one query — if the board could be built from a leaner fetch than
 * the graph, the two would eventually disagree about what the story
 * contains. They also share the auth gate: the redirect belongs next to
 * the load, not copied into every page.
 */
export async function loadStory(storyId: string): Promise<GraphResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const graph = await getGraph(supabase, storyId);

  if (!graph) {
    notFound();
  }

  return graph;
}

/**
 * Today, as an ISO date, decided on the server.
 *
 * The list and the board both want to mark what is overdue, and neither
 * may ask the clock itself: reading `Date.now()` while rendering is
 * impure, and a client-computed date can disagree with the server's
 * during hydration. Handing it down as a prop settles both.
 *
 * It is UTC, so someone working late in a far-eastern timezone may see a
 * date tip over a few hours before or after their own midnight. That is
 * a smaller wrong than a due-date badge that flickers on hydration.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
