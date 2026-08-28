export const TASK_IMAGE_BUCKET = "task-images";

/** 10 MB, matching the bucket's own limit — see the migration. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
];

/**
 * Where a stored picture is read from.
 *
 * The app's own route, not the storage URL. The bucket is private, so a
 * direct link would have to be signed and would stop working when the
 * signature expired — inside a description, which is text saved forever,
 * that is a picture with a timer on it. A relative path never expires
 * and is checked against the session on every request.
 */
export function taskImageUrl(path: string): string {
  return `/api/v1/attachments/${path}`;
}

/** The extension a stored file should carry, from what the browser says it is. */
export function extensionFor(type: string): string {
  const known: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  return known[type] ?? "bin";
}

/**
 * Why this file can't be uploaded, or null if it can.
 *
 * Checked here as well as by the bucket because a refusal that arrives
 * after the upload has finished is a refusal the person waited for.
 */
export function rejectImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `${file.name || "That file"} isn't an image this can store.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name || "That image"} is larger than 10 MB.`;
  }
  return null;
}

/**
 * The Markdown for a picture, ready to drop into a description.
 *
 * The alt text is the file's own name with its extension taken off,
 * which is usually what it was called when it was made — a better
 * description than "image" and a worse one than a person would write,
 * which is the right trade for something inserted automatically.
 */
export function imageMarkdown(name: string, url: string): string {
  const alt = name.replace(/\.[^.]+$/, "").trim() || "image";
  return `![${alt}](${url})`;
}

/**
 * Adds the picture to a description without disturbing what is there.
 *
 * On its own line with a blank line before it, because Markdown will
 * otherwise fold it into the paragraph above and the picture ends up
 * mid-sentence.
 */
export function appendImage(description: string, markdown: string): string {
  if (description.trim() === "") return markdown;
  return `${description.replace(/\s+$/, "")}\n\n${markdown}`;
}
