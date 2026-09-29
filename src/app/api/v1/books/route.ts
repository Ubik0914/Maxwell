import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { bookSearchSchema } from "@/lib/validation/book";
import { filterBooks, libraryStats, sortBooks } from "@/domain/library/filter";
import * as bookRepository from "@/repositories/book.repository";

/**
 * The caller's books, searched the same way the library page searches
 * them: every word must appear somewhere, width, case and kana folded.
 *
 *   GET /api/v1/books?q=orwell&status=READ&sort=title&limit=20
 *
 * The whole shelf is read and filtered here rather than in SQL so the
 * API and the page cannot disagree about what "matches" means — there
 * is one filterBooks, and a personal library is small enough for that
 * to cost nothing.
 *
 * `total` is how many matched before `limit`, and `stats` counts the
 * whole shelf, so a caller can tell "nothing like that" from "cut off".
 */
export async function GET(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const parsed = bookSearchSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid query",
    );
  }

  const { q, status, sort, limit } = parsed.data;

  try {
    const books = await bookRepository.listBooks(supabase);
    const matched = sortBooks(filterBooks(books, { query: q, status }), sort);
    return apiSuccess({
      books: matched.slice(0, limit),
      total: matched.length,
      stats: libraryStats(books),
    });
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to load books.");
  }
}
