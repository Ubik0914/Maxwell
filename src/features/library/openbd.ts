import { parseOpenBdRecord, type BookDetails } from "@/domain/library/openbd";

/**
 * One ISBN's record from openBD, or null when openBD has none.
 * Throws when openBD cannot be reached, so a caller can tell "this book
 * is not in the database" from "the database did not answer".
 *
 * Cached for a day: a book's colophon does not change, and a shelf
 * scanned twice should not cost openBD twice.
 */
export async function fetchOpenBd(isbn: string): Promise<BookDetails | null> {
  const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error(`openBD ${response.status}`);
  const records: unknown = await response.json();
  return Array.isArray(records) ? parseOpenBdRecord(records[0]) : null;
}
