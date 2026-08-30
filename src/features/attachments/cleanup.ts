import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { TASK_IMAGE_BUCKET } from "@/features/attachments/task-images";

type Client = SupabaseClient<Database, "dag">;

/**
 * Throws away the pictures belonging to stories that are about to stop
 * existing.
 *
 * Storage is not part of the database's cascade: a story's rows go when
 * the story does, but the files under `<storyId>/` sit there afterwards,
 * paid for and unreachable. Unreachable in the strong sense, too — the
 * bucket's policies decide who may delete a file by looking up the
 * story's workspace and asking whether you are in it, so once the story
 * row is gone there is no longer anybody who can answer yes. Nobody can
 * ever remove them again, from the app or from the CLI.
 *
 * Which is why this runs *before* the delete rather than after it, and
 * why a failure here does not stop the delete: a story someone asked to
 * remove should go even if a picture in it would not. The cost of the
 * wrong order is permanent; the cost of a leftover file is a few
 * kilobytes.
 */
export async function deleteTaskImages(
  supabase: Client,
  storyIds: string[],
): Promise<void> {
  const paths: string[] = [];

  for (const storyId of storyIds) {
    const { data, error } = await supabase.storage
      .from(TASK_IMAGE_BUCKET)
      .list(storyId);

    // A story with no pictures lists nothing; a bucket that isn't there
    // yet errors. Neither is a reason to keep a story alive.
    if (error || !data) continue;
    for (const file of data) paths.push(`${storyId}/${file.name}`);
  }

  if (paths.length === 0) return;
  await supabase.storage.from(TASK_IMAGE_BUCKET).remove(paths);
}
