"use server";

import { createClient } from "@/lib/supabase/server";
import { ErrorCode } from "@/lib/errors/codes";
import {
  bookFieldsSchema,
  isbnLookupSchema,
  type BookFieldsInput,
} from "@/lib/validation/book";
import type { BookDetails } from "@/domain/library/openbd";
import { fetchOpenBd } from "@/features/library/openbd";
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
 * Title, author, publisher, date and price for an ISBN, from openBD.
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
    const details = await fetchOpenBd(isbn);
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

function unreachable<T>(): ActionResult<T> {
  return {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: "openBD に接続できませんでした。手で入力してください。",
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
 * `defaults` are the scanning session's settings (which shelf, read or
 * not), applied to every book it adds.
 */
export async function addBookByIsbnAction(
  rawIsbn: string,
  defaults: Pick<BookFieldsInput, "location" | "reading_status"> = {},
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
    details = await fetchOpenBd(isbn);
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
