import { parseOpenBdRecord, type BookDetails } from "@/domain/library/openbd";
import { mergeDetails, parseNdlOpenSearch } from "@/domain/library/ndl";

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
  return mergeDetails(
    openbd.status === "fulfilled" ? openbd.value : null,
    ndl.status === "fulfilled" ? ndl.value : null,
  );
}
