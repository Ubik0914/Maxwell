"use client";

import { createClient } from "@/lib/supabase/client";
import {
  TASK_IMAGE_BUCKET,
  extensionFor,
  taskImageUrl,
} from "@/features/attachments/task-images";

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

/**
 * Puts a picture in the bucket and says where to find it.
 *
 * Straight from the browser rather than through a server action: an
 * image goes up as bytes, and routing those through a server action
 * means base64 in a form post and the whole file held in memory twice.
 * Storage checks the session and the story's policies itself (see the
 * task-images migration), so nothing is trusted here that would not
 * have been trusted anyway.
 *
 * The name is a fresh uuid rather than the file's own. Two people
 * attaching screenshot.png would otherwise overwrite each other, and a
 * filename is the one part of an upload that carries whatever the
 * person's computer happened to call it.
 */
export async function uploadTaskImage(
  file: File,
  storyId: string,
): Promise<UploadResult> {
  const path = `${storyId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
  const supabase = createClient();

  const { error } = await supabase.storage
    .from(TASK_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return {
      ok: false,
      message:
        "That image couldn't be saved. Check you can still edit this story.",
    };
  }

  return { ok: true, url: taskImageUrl(path) };
}
