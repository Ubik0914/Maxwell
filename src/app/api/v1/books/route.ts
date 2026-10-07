import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import {
  bookAddByIsbnSchema,
  bookFieldsSchema,
  bookMoveSchema,
  bookSearchSchema,
} from "@/lib/validation/book";
import {
  CatalogueUnreachableError,
  InvalidDetailsError,
  shelveByIsbn,
} from "@/features/library/shelve";
import { filterBooks, libraryStats, sortBooks } from "@/domain/library/filter";
import * as bookRepository from "@/repositories/book.repository";

/**
 * The caller's books, searched the same way the library page searches
 * them: every word must appear somewhere, width, case and kana folded.
 *
 *   GET /api/v1/books?q=orwell&sort=title&limit=20
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

  const { q, sort, limit } = parsed.data;

  try {
    const books = await bookRepository.listBooks(supabase);
    const matched = sortBooks(filterBooks(books, { query: q }), sort);
    return apiSuccess({
      books: matched.slice(0, limit),
      total: matched.length,
      stats: libraryStats(books),
    });
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to load books.");
  }
}

function isDuplicate(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === bookRepository.DUPLICATE_ISBN
  );
}

/**
 * Adds a book.
 *
 *   POST /api/v1/books  { "isbn": "978…", "location": "自宅", "note": "…" }
 *   POST /api/v1/books  { "title": "…", "authors": "…", … }
 *
 * An ISBN alone is looked up exactly as a scan in the app looks it up
 * (shelveByIsbn): the reply's `status` says whether it was `added`, was
 * already on the shelf (`duplicate`, the book left as it was), or is a
 * number no catalogue knows (`not_found`, nothing added). Anything with
 * a title is a book written out by hand and is stored as given.
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError(ErrorCode.VALIDATION_ERROR, "Expected a JSON object.");
  }

  if (!("title" in body)) {
    const parsed = bookAddByIsbnSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        ErrorCode.VALIDATION_ERROR,
        parsed.error.issues[0]?.message ?? "Invalid input",
      );
    }
    const { isbn, location, note } = parsed.data;
    try {
      const outcome = await shelveByIsbn(supabase, isbn, {
        location: location as string | null | undefined,
        note: note as string | null | undefined,
      });
      return apiSuccess(outcome, outcome.status === "added" ? 201 : 200);
    } catch (error) {
      if (error instanceof CatalogueUnreachableError) {
        return apiError(ErrorCode.INTERNAL_ERROR, error.message, 502);
      }
      if (error instanceof InvalidDetailsError) {
        return apiError(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return apiError(ErrorCode.INTERNAL_ERROR, "Failed to add the book.");
    }
  }

  const parsed = bookFieldsSchema.strict().safeParse(body);
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }
  try {
    const book = await bookRepository.createBook(supabase, parsed.data);
    return apiSuccess({ status: "added", book }, 201);
  } catch (error) {
    if (isDuplicate(error)) {
      return apiError(
        ErrorCode.VALIDATION_ERROR,
        "A book with this ISBN is already on the shelf.",
      );
    }
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to add the book.");
  }
}

/**
 * Moves several books to one place at once.
 *
 *   PATCH /api/v1/books  { "bookIds": ["…", "…"], "location": "会社" }
 *
 * A blank or null location takes them off any shelf. Ids the caller
 * cannot see are skipped rather than refused; `moved` says how many
 * actually moved.
 */
export async function PATCH(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const parsed = bookMoveSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  const place = parsed.data.location?.normalize("NFKC").trim() ?? "";
  if (place.length > 100) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      "場所は100文字以内で入力してください",
    );
  }

  try {
    const books = await bookRepository.moveBooks(
      supabase,
      parsed.data.bookIds,
      place === "" ? null : place,
    );
    return apiSuccess({ moved: books.length, books });
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to move the books.");
  }
}
