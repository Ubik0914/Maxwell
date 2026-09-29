import { normalizeIsbn } from "@/domain/library/isbn";

/**
 * The ISBN in a barcode, or null when the barcode is not one.
 *
 * A Japanese book carries two EAN-13s stacked on its back cover: the
 * ISBN (978/979…) on top and the 書籍JANコード underneath, which starts
 * 192 and encodes the classification and the price. A camera pointed
 * at the back sees both, often the lower one first, so anything that
 * is not a book-land EAN is simply not an answer — it must not become
 * a "not found" row every time the phone drifts down a centimetre.
 *
 * A hardware scanner or a person typing can send an ISBN-10 or a
 * hyphenated one, which normalizeIsbn already reads.
 */
export function isbnFromBarcode(text: string): string | null {
  const trimmed = text.trim();
  if (/^\d{13}$/.test(trimmed) && !/^97[89]/.test(trimmed)) return null;
  return normalizeIsbn(trimmed);
}

/**
 * Remembers which ISBNs this scanning session has already seen.
 *
 * A camera reads the same barcode many times a second for as long as
 * it is in frame, so "seen" has to mean "for the rest of the session",
 * not "in the last few frames": a book held still while the result
 * comes back must not be queued again, and nor must one scanned a
 * second time by mistake five books later — it is already in the list.
 */
export class ScanSession {
  private readonly seen = new Set<string>();

  /** True the first time an ISBN is offered, false every time after. */
  admit(isbn: string): boolean {
    if (this.seen.has(isbn)) return false;
    this.seen.add(isbn);
    return true;
  }

  /** Lets an ISBN be scanned again — after its book was taken back off. */
  forget(isbn: string): void {
    this.seen.delete(isbn);
  }
}
