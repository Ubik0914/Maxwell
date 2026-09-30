"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ErrorCode } from "@/lib/errors/codes";
import {
  bookFieldsSchema,
  isbnLookupSchema,
  type BookFieldsInput,
} from "@/lib/validation/book";
import type { BookDetails } from "@/domain/library/openbd";
import {
  CatalogueBusyError,
  fetchBookDetails,
  searchByTitle,
} from "@/features/library/bibliography";
import type { BookCandidate } from "@/domain/library/ndl";
import type { ShelvedBook } from "@/domain/library/filter";
import * as bookRepository from "@/repositories/book.repository";
import type { ActionResult } from "@/types/action-result";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function notLoggedIn<T>(): ActionResult<T> {
  return {
    success: false,
    error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
  };
}

function invalid<T>(message: string): ActionResult<T> {
  return {
    success: false,
    error: { code: ErrorCode.VALIDATION_ERROR, message },
  };
}

function isDuplicate(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === bookRepository.DUPLICATE_ISBN
  );
}

function failed<T>(error: unknown, message: string): ActionResult<T> {
  if (isDuplicate(error)) {
    return invalid("この ISBN の本はすでに登録されています。");
  }
  return {
    success: false,
    error: { code: ErrorCode.INTERNAL_ERROR, message },
  };
}

export async function createBookAction(
  input: BookFieldsInput,
): Promise<ActionResult<ShelvedBook>> {
  const parsed = bookFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  try {
    const book = await bookRepository.createBook(supabase, parsed.data);
    return { success: true, data: book };
  } catch (error) {
    return failed(error, "本を登録できませんでした。");
  }
}

export async function updateBookAction(
  bookId: string,
  input: BookFieldsInput,
): Promise<ActionResult<ShelvedBook>> {
  const parsed = bookFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  try {
    const book = await bookRepository.updateBook(supabase, bookId, parsed.data);
    return { success: true, data: book };
  } catch (error) {
    return failed(error, "変更を保存できませんでした。");
  }
}

export async function deleteBookAction(
  bookId: string,
): Promise<ActionResult<null>> {
  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  try {
    await bookRepository.deleteBook(supabase, bookId);
    return { success: true, data: null };
  } catch (error) {
    return failed(error, "本を削除できませんでした。");
  }
}

/**
 * Title, author, publisher, date, price and cover for an ISBN, from
 * openBD with the NDL filling its gaps.
 *
 * Fetched here rather than from the browser so the page does not
 * depend on a third party's CORS headers, and so a slow openBD costs
 * one bounded wait instead of a hung form.
 */
export async function lookupIsbnAction(
  rawIsbn: string,
): Promise<ActionResult<BookDetails & { isbn: string }>> {
  const parsed = isbnLookupSchema.safeParse(rawIsbn);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid ISBN");
  }

  const { user } = await requireUser();
  if (!user) return notLoggedIn();

  const isbn = parsed.data;
  try {
    const details = await fetchBookDetails(isbn);
    if (!details) {
      return invalid(
        "この ISBN の書誌が見つかりませんでした。手で入力してください。",
      );
    }
    return { success: true, data: { ...details, isbn } };
  } catch {
    return unreachable();
  }
}

/**
 * Books that go by this title, for the manual form: typing a title and
 * picking the edition beats typing everything else too.
 */
export async function searchTitleAction(
  rawTitle: string,
): Promise<ActionResult<BookCandidate[]>> {
  const title = rawTitle.normalize("NFKC").trim();
  if (title.length < 2) return invalid("書名を2文字以上入力してください");
  if (title.length > 200) return invalid("書名が長すぎます");

  const { user } = await requireUser();
  if (!user) return notLoggedIn();

  try {
    return { success: true, data: await searchByTitle(title) };
  } catch (error) {
    if (error instanceof CatalogueBusyError) {
      return {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message:
            "国立国会図書館の検索が混み合っています。少し待ってからもう一度お試しください。",
        },
      };
    }
    return unreachable();
  }
}

function unreachable<T>(): ActionResult<T> {
  return {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: "書誌データベースに接続できませんでした。手で入力してください。",
    },
  };
}

export type ScanOutcome =
  | { status: "added"; book: ShelvedBook }
  | { status: "duplicate"; book: ShelvedBook }
  | { status: "not_found"; isbn: string };

/**
 * One scan: an ISBN in, a book on the shelf out.
 *
 * The continuous scanner calls this once per barcode, so it does the
 * whole job in one round trip — check the shelf, ask openBD, insert —
 * rather than making the page choreograph three. What it cannot do is
 * invent a title: an ISBN openBD does not know comes back as not_found
 * for the person to fill in, rather than as a row called "9784…".
 *
 * `defaults` are the scanning session's settings (which shelf the books
 * are going on), applied to every book it adds.
 */
export async function addBookByIsbnAction(
  rawIsbn: string,
  defaults: Pick<BookFieldsInput, "location"> = {},
): Promise<ActionResult<ScanOutcome>> {
  const parsed = isbnLookupSchema.safeParse(rawIsbn);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid ISBN");
  }

  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  const isbn = parsed.data;

  try {
    const existing = await bookRepository.findBookByIsbn(supabase, isbn);
    if (existing)
      return { success: true, data: { status: "duplicate", book: existing } };
  } catch (error) {
    return failed(error, "本棚を確認できませんでした。");
  }

  let details: BookDetails | null;
  try {
    details = await fetchBookDetails(isbn);
  } catch {
    return unreachable();
  }
  if (!details) return { success: true, data: { status: "not_found", isbn } };

  const fields = bookFieldsSchema.safeParse({ ...details, ...defaults, isbn });
  if (!fields.success) {
    return invalid(fields.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const book = await bookRepository.createBook(supabase, fields.data);
    return { success: true, data: { status: "added", book } };
  } catch (error) {
    // Two scans of the same book racing each other: the unique index
    // lets one in, and the other is the duplicate it would have been
    // had it arrived a moment later.
    if (isDuplicate(error)) {
      const book = await bookRepository
        .findBookByIsbn(supabase, isbn)
        .catch(() => null);
      if (book) return { success: true, data: { status: "duplicate", book } };
    }
    return failed(error, "本を登録できませんでした。");
  }
}

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** The fields a re-fetch may fill — every one the catalogues can supply. */
const FILLABLE = [
  "authors",
  "publisher",
  "published",
  "price",
  "cover_url",
  "ndc",
] as const;

type Refill =
  | { ok: true; book: ShelvedBook; filled: string[] }
  | { ok: false; reason: "no_isbn" | "not_found" | "unreachable" | "invalid" };

/**
 * Looks one book up again and fills whatever it is missing — a price
 * openBD did not have, a cover (see findCover, which fetchBookDetails
 * consults when openBD has none) — without touching anything someone
 * has already written. The one re-fetch, used for a single book and
 * for the whole shelf alike.
 */
async function refill(supabase: Client, book: ShelvedBook): Promise<Refill> {
  if (!book.isbn) return { ok: false, reason: "no_isbn" };

  let details: BookDetails | null;
  try {
    details = await fetchBookDetails(book.isbn);
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (!details) return { ok: false, reason: "not_found" };

  const found = details;
  const filled = FILLABLE.filter(
    (key) => book[key] == null && found[key] != null,
  );
  if (filled.length === 0) return { ok: true, book, filled: [] };

  const fields = bookFieldsSchema.safeParse({
    ...book,
    ...Object.fromEntries(filled.map((key) => [key, found[key]])),
  });
  if (!fields.success) return { ok: false, reason: "invalid" };

  const updated = await bookRepository.updateBook(
    supabase,
    book.id,
    fields.data,
  );
  return { ok: true, book: updated, filled };
}

/** Whether a re-fetch could still add something to this book. */
function incomplete(book: ShelvedBook): boolean {
  return FILLABLE.some((key) => book[key] == null);
}

/** A single book's 書誌を再取得. */
export async function refreshBookAction(
  bookId: string,
): Promise<ActionResult<{ book: ShelvedBook; filled: string[] }>> {
  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  let book: ShelvedBook | null;
  try {
    book = await bookRepository.findBook(supabase, bookId);
  } catch (error) {
    return failed(error, "本を読み込めませんでした。");
  }
  if (!book) return invalid("本が見つかりません。");

  try {
    const result = await refill(supabase, book);
    if (result.ok) {
      return {
        success: true,
        data: { book: result.book, filled: result.filled },
      };
    }
    switch (result.reason) {
      case "no_isbn":
        return invalid("ISBN が無いため再取得できません。");
      case "not_found":
        return invalid("この ISBN の書誌が見つかりませんでした。");
      case "unreachable":
        return unreachable();
      default:
        return invalid("取得した書誌を保存できませんでした。");
    }
  } catch (error) {
    return failed(error, "書誌を保存できませんでした。");
  }
}

/** How many books one bulk call handles; the page calls again. */
const REFRESH_BATCH = 8;

/**
 * The whole shelf's 書誌を再取得, a handful of books per call.
 *
 * The page sends every book with an ISBN and a blank field through
 * this a few at a time, so a long shelf never has to fit inside one
 * server function's time limit and the progress it shows is real.
 * Books that are already complete are skipped here too, in case the
 * page's copy was stale.
 */
export async function refreshBooksAction(
  bookIds: string[],
): Promise<
  ActionResult<{ updated: ShelvedBook[]; unchanged: number; failed: number }>
> {
  const ids = z.array(z.string().uuid()).max(REFRESH_BATCH).safeParse(bookIds);
  if (!ids.success) return invalid("Invalid book ids");

  const { supabase, user } = await requireUser();
  if (!user) return notLoggedIn();

  const updated: ShelvedBook[] = [];
  let unchanged = 0;
  let failedCount = 0;

  await Promise.all(
    ids.data.map(async (bookId) => {
      try {
        const book = await bookRepository.findBook(supabase, bookId);
        if (!book?.isbn || !incomplete(book)) return;
        const result = await refill(supabase, book);
        if (!result.ok) failedCount += 1;
        else if (result.filled.length > 0) updated.push(result.book);
        else unchanged += 1;
      } catch {
        failedCount += 1;
      }
    }),
  );

  return {
    success: true,
    data: { updated, unchanged, failed: failedCount },
  };
}
