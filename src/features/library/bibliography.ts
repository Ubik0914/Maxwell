import { parseOpenBdRecord, type BookDetails } from "@/domain/library/openbd";
import {
  mergeDetails,
  parseNdlCandidates,
  parseNdlOpenSearch,
  rankCandidates,
  type BookCandidate,
} from "@/domain/library/ndl";
import { coverCandidates, MIN_COVER_BYTES } from "@/domain/library/cover";

/*
 * Both sources are cached for a day: a book's colophon does not change,
 * and a shelf scanned twice should not cost either service twice.
 */
const FETCH = { next: { revalidate: 86400 } } as const;

async function fetchOpenBd(isbn: string): Promise<BookDetails | null> {
  const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`, {
    ...FETCH,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`openBD ${response.status}`);
  const records: unknown = await response.json();
  return Array.isArray(records) ? parseOpenBdRecord(records[0]) : null;
}

async function fetchNdl(isbn: string): Promise<BookDetails | null> {
  const response = await fetch(
    `https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${isbn}&cnt=5`,
    { ...FETCH, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new Error(`NDL ${response.status}`);
  return parseNdlOpenSearch(await response.text());
}

/**
 * Everything the two catalogues know about one ISBN: openBD's record,
 * with the gaps (most often the price) filled from the NDL. Asked of
 * both at once, so the fallback costs no extra wait.
 *
 * Null when neither knows the book. Throws only when neither could be
 * reached, so a caller can still tell "not in any catalogue" from "the
 * catalogues did not answer" — one of them being down is not a failure
 * as long as the other replied.
 */
export async function fetchBookDetails(
  isbn: string,
): Promise<BookDetails | null> {
  const [openbd, ndl] = await Promise.allSettled([
    fetchOpenBd(isbn),
    fetchNdl(isbn),
  ]);
  if (openbd.status === "rejected" && ndl.status === "rejected") {
    throw openbd.reason;
  }
  const details = mergeDetails(
    openbd.status === "fulfilled" ? openbd.value : null,
    ndl.status === "fulfilled" ? ndl.value : null,
  );
  // openBD's records rarely carry a cover now; look one up by ISBN.
  if (details && !details.cover_url) {
    details.cover_url = await findCover(isbn);
  }
  return details;
}

/**
 * The first cover candidate that is a real picture, or null.
 *
 * Checked here, once, rather than left to the browser: both hosts answer
 * a miss with a tiny placeholder instead of a 404, and a stored URL is
 * only worth storing if it is a cover. Not cached — the image bodies
 * are only weighed, never kept.
 */
export async function findCover(isbn: string): Promise<string | null> {
  for (const url of coverCandidates(isbn)) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!response.ok) continue;
      if (!response.headers.get("content-type")?.startsWith("image/")) {
        continue;
      }
      const body = await response.arrayBuffer();
      if (body.byteLength >= MIN_COVER_BYTES) return url;
    } catch {
      // One host being slow or down is a reason to try the next.
    }
  }
  return null;
}

/** The NDL refused for now: too many searches in a row. */
export class CatalogueBusyError extends Error {
  constructor() {
    super("NDL 429");
  }
}

/** How many books a title search offers: enough to find the edition. */
const CANDIDATES = 10;

/**
 * Books whose title matches, for picking one when there is no barcode
 * to scan.
 *
 * openBD answers only by ISBN — it has no title search — so the NDL
 * finds the ISBNs, and openBD is then asked for all of them in one
 * request. Its records win where it has one (the publisher's own
 * title, authors and price); the NDL's fill the rest, and stand alone
 * for a book openBD does not carry.
 *
 * Throws when the NDL cannot be reached: without it there is nothing
 * to search. openBD being down only costs its polish.
 */
export async function searchByTitle(title: string): Promise<BookCandidate[]> {
  const response = await fetch(
    `https://ndlsearch.ndl.go.jp/api/opensearch?title=${encodeURIComponent(
      title,
    )}&cnt=50`,
    { ...FETCH, signal: AbortSignal.timeout(10000) },
  );
  // The NDL rate-limits bursts; say so rather than "unreachable".
  if (response.status === 429) throw new CatalogueBusyError();
  if (!response.ok) throw new Error(`NDL ${response.status}`);
  // Fifty records for ten books: many are articles and maps with no
  // ISBN, which the parser drops.
  const found = rankCandidates(
    parseNdlCandidates(await response.text()),
    title,
  ).slice(0, CANDIDATES);
  if (found.length === 0) return [];

  let records: unknown[] = [];
  try {
    const openbd = await fetch(
      `https://api.openbd.jp/v1/get?isbn=${found.map((book) => book.isbn).join(",")}`,
      { ...FETCH, signal: AbortSignal.timeout(8000) },
    );
    if (openbd.ok) {
      const body: unknown = await openbd.json();
      if (Array.isArray(body)) records = body;
    }
  } catch {
    // The NDL's records are enough to choose from.
  }

  return found.map((ndl, index) => {
    const merged = mergeDetails(parseOpenBdRecord(records[index]), ndl);
    return { ...ndl, ...merged, isbn: ndl.isbn };
  });
}
