/**
 * Markdown task-list syntax, as text.
 *
 * Kept apart from the renderer on purpose: this is string work with no
 * React and no react-markdown in it, so it can be reasoned about — and
 * tested — without pulling an ESM-only rendering stack into the test
 * runner behind it.
 */

/**
 * `- [ ]` / `1. [x]` at the start of a line, with the indent split off
 * so the offset of the bullet itself can be recovered. That offset is
 * exactly where mdast says the list item starts, which is what lets a
 * rendered item find its own checkbox in the source.
 *
 * Built fresh per call rather than shared: a global RegExp carries
 * `lastIndex` between uses, and the second call would start halfway
 * through the text.
 */
function taskMarker(): RegExp {
  return /^([ \t]*)((?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]/gm;
}

/** Where each checkbox's bullet begins, in document order. */
export function taskMarkerOffsets(source: string): number[] {
  const offsets: number[] = [];
  const pattern = taskMarker();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    offsets.push(match.index + match[1].length);
  }
  return offsets;
}

/**
 * Flips the nth `[ ]`/`[x]` in a Markdown source.
 *
 * By index rather than by matching the item's text: two items can say
 * the same thing, and the one you ticked is the one you ticked.
 */
export function toggleTaskAt(source: string, index: number): string {
  let seen = -1;
  return source.replace(
    taskMarker(),
    (whole, indent: string, bullet: string, mark: string) => {
      seen += 1;
      if (seen !== index) return whole;
      return `${indent}${bullet}[${mark === " " ? "x" : " "}]`;
    },
  );
}
