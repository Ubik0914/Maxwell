import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
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
