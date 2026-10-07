import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { bookFieldsSchema, bookPatchSchema } from "@/lib/validation/book";
import * as bookRepository from "@/repositories/book.repository";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { bookId } = await params;
  // Not a uuid is simply not a book. Answering 404 rather than letting
  // Postgres reject the cast keeps "no such book" one answer.
  if (!z.string().uuid().safeParse(bookId).success) {
    return apiError(ErrorCode.BOOK_NOT_FOUND, "Book not found.");
  }

  try {
    const book = await bookRepository.findBook(supabase, bookId);
    if (!book) {
      // Someone else's book and no book look the same on purpose.
      return apiError(ErrorCode.BOOK_NOT_FOUND, "Book not found.");
    }
    return apiSuccess(book);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to load book.");
  }
}

/**
 * Changes some of one book's fields and leaves the rest as they are.
 *
 *   PATCH /api/v1/books/:id  { "note": "…", "location": "会社" }
 *
 * The change is laid over the book as it stands and the result checked
 * by the same rules as a book written out in full, so a partial edit
 * cannot store anything a full one could not. null or "" clears a
 * field (the title excepted: a book always has one).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { bookId } = await params;
  if (!z.string().uuid().safeParse(bookId).success) {
    return apiError(ErrorCode.BOOK_NOT_FOUND, "Book not found.");
  }

  const patch = bookPatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!patch.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      patch.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    const book = await bookRepository.findBook(supabase, bookId);
    if (!book) return apiError(ErrorCode.BOOK_NOT_FOUND, "Book not found.");

    const fields = bookFieldsSchema.safeParse({ ...book, ...patch.data });
    if (!fields.success) {
      return apiError(
        ErrorCode.VALIDATION_ERROR,
        fields.error.issues[0]?.message ?? "Invalid input",
      );
    }
    return apiSuccess(
      await bookRepository.updateBook(supabase, bookId, fields.data),
    );
  } catch (error) {
    if (
      !!error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === bookRepository.DUPLICATE_ISBN
    ) {
      return apiError(
        ErrorCode.VALIDATION_ERROR,
        "A book with this ISBN is already on the shelf.",
      );
    }
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to update the book.");
  }
}

/** Removes one book. Someone else's book and no book are both 404. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { bookId } = await params;
  if (!z.string().uuid().safeParse(bookId).success) {
    return apiError(ErrorCode.BOOK_NOT_FOUND, "Book not found.");
  }

  try {
    const deleted = await bookRepository.deleteBooks(supabase, [bookId]);
    if (deleted === 0) {
      return apiError(ErrorCode.BOOK_NOT_FOUND, "Book not found.");
    }
    return apiSuccess({ deleted: bookId });
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to delete the book.");
  }
}
