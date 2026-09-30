import { toIsbn10 } from "@/domain/library/isbn";

/**
 * Where a book's cover can be found, best first.
 *
 * Measured from Vercel's Tokyo region (2026-09): openBD's records carry
 * no cover for most books any more and cover.openbd.jp answers 404; the
 * National Diet Library's thumbnail endpoint refuses server and browser
 * requests alike with 403. What does answer:
 *
 *   版元ドットコム  the publishers' own cover registry, free to use for
 *                  introducing a book — the first choice. 7 of 8
 *                  sampled books.
 *   Amazon         the image path by ISBN-10. Not a documented API, so
 *                  only the fallback — but it had all 8.
 *
 * Both answer a miss with a tiny placeholder rather than an error (a
 * 176-byte JPEG, a 1×1 GIF), which is why the server checks the size of
 * what comes back before keeping a URL, and the browser checks the
 * image's width before showing one.
 */
export function coverCandidates(isbn13: string): string[] {
  const candidates = [`https://www.hanmoto.com/bd/img/${isbn13}.jpg`];
  const isbn10 = toIsbn10(isbn13);
  if (isbn10) {
    candidates.push(
      `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.09.LZZZZZZZ.jpg`,
    );
  }
  return candidates;
}

/** Below this many bytes an "image" is a host's placeholder for a miss. */
export const MIN_COVER_BYTES = 1000;

/** Narrower than this in the browser, likewise. */
export const MIN_COVER_WIDTH = 20;
