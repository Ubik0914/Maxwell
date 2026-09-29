"use server";

import { createClient } from "@/lib/supabase/server";
import { ErrorCode } from "@/lib/errors/codes";
import {
  bookFieldsSchema,
  isbnLookupSchema,
  type BookFieldsInput,
} from "@/lib/validation/book";
import { parseOpenBdRecord, type BookDetails } from "@/domain/library/openbd";
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

function failed<T>(error: unknown, message: string): ActionResult<T> {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === bookRepository.DUPLICATE_ISBN
  ) {
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
    const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`openBD ${response.status}`);
    const records: unknown = await response.json();
    const details = Array.isArray(records)
      ? parseOpenBdRecord(records[0])
      : null;
    if (!details) {
      return invalid(
        "この ISBN の書誌が見つかりませんでした。手で入力してください。",
      );
    }
    return { success: true, data: { ...details, isbn } };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "openBD に接続できませんでした。手で入力してください。",
      },
    };
  }
}
