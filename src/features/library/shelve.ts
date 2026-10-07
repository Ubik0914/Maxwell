import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ShelvedBook } from "@/domain/library/filter";
import type { BookDetails } from "@/domain/library/openbd";
import { fetchBookDetails } from "@/features/library/bibliography";
import { bookFieldsSchema, type BookFieldsInput } from "@/lib/validation/book";
import * as bookRepository from "@/repositories/book.repository";

type Client = SupabaseClient<Database, "dag">;

export type ScanOutcome =
  | { status: "added"; book: ShelvedBook }
  | { status: "duplicate"; book: ShelvedBook }
  | { status: "not_found"; isbn: string };

/** The catalogues could not be reached: nothing was added. */
export class CatalogueUnreachableError extends Error {
  constructor() {
    super("書誌データベースに接続できませんでした。");
  }
}

/** What the catalogue had could not be stored as a book. */
export class InvalidDetailsError extends Error {}

function isDuplicate(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === bookRepository.DUPLICATE_ISBN
  );
}

/**
 * An ISBN in, a book on the shelf out — the one way a book is added by
 * its number, whether a scan in the app asked or a client of /api/v1.
 *
 * Checks the shelf, asks the catalogues, inserts. What it cannot do is
 * invent a title: an ISBN no catalogue knows comes back as not_found
 * rather than as a row called "9784…". `defaults` (a place, a note) go
 * on the book it adds; a book already on the shelf is left as it is.
 *
 * Throws CatalogueUnreachableError when the catalogues are down,
 * InvalidDetailsError when what they returned does not validate, and
 * the repository's own error for anything the database refused.
 */
export async function shelveByIsbn(
  supabase: Client,
  isbn: string,
  defaults: Pick<BookFieldsInput, "location" | "note"> = {},
): Promise<ScanOutcome> {
  const existing = await bookRepository.findBookByIsbn(supabase, isbn);
  if (existing) return { status: "duplicate", book: existing };

  let details: BookDetails | null;
  try {
    details = await fetchBookDetails(isbn);
  } catch {
    throw new CatalogueUnreachableError();
  }
  if (!details) return { status: "not_found", isbn };

  const fields = bookFieldsSchema.safeParse({ ...details, ...defaults, isbn });
  if (!fields.success) {
    throw new InvalidDetailsError(
      fields.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    const book = await bookRepository.createBook(supabase, fields.data);
    return { status: "added", book };
  } catch (error) {
    // Two adds of the same book racing each other: the unique index
    // lets one in, and the other is the duplicate it would have been
    // had it arrived a moment later.
    if (isDuplicate(error)) {
      const book = await bookRepository
        .findBookByIsbn(supabase, isbn)
        .catch(() => null);
      if (book) return { status: "duplicate", book };
    }
    throw error;
  }
}
