import { createClient } from "@/lib/supabase/server";
import { TASK_IMAGE_BUCKET } from "@/features/attachments/task-images";

/** Only the shape the uploader writes: a uuid and one extension. */
const FILE_NAME = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;
const STORY_ID = /^[0-9a-f-]{36}$/;

/**
 * Hands back a picture from a task's description.
 *
 * The bucket is private, so this is how they are read. It could have
 * been a signed URL instead, and that would have been one fewer route —
 * but a signed URL expires, and these are written into descriptions,
 * which are text kept forever. A picture that stops loading three
 * months later is worse than a route.
 *
 * Nothing is checked here beyond the shape of the path: the download
 * runs as the signed-in user, so storage's own policies decide whether
 * this file is theirs to see, and a file in a story they are not a
 * member of comes back as nothing. Doing the check here as well would
 * be a second opinion that could drift from the first.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storyId: string; file: string }> },
) {
  const { storyId, file } = await params;
  if (!STORY_ID.test(storyId) || !FILE_NAME.test(file)) {
    return new Response(null, { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(TASK_IMAGE_BUCKET)
    .download(`${storyId}/${file}`);

  if (error || !data) {
    return new Response(null, { status: 404 });
  }

  return new Response(data, {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      // Named after its content, so it is immutable — but private,
      // because who may read it is a question about the session and not
      // about the URL. A shared cache holding this would answer for
      // somebody else.
      "Cache-Control": "private, max-age=31536000, immutable",
      // It is a picture. Nothing here should ever be interpreted as
      // anything else, whatever the bytes turn out to be.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
