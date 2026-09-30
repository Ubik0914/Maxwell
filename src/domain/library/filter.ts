import { ndcGenre } from "@/domain/library/ndc";

/**
 * Finding a book on the shelf.
 *
 * A library of this size is hundreds of books, not millions, so every
 * book is on the page already and the search runs in the browser as you
 * type — no round trip between a keystroke and the answer.
 *
 * A book here has no state at all — no reading status, no loans. It is
 * a catalogue of what is on the shelf and where, nothing more.
 */

export interface ShelvedBook {
  id: string;
  title: string;
  authors: string | null;
  publisher: string | null;
  published: string | null;
  price: number | null;
  isbn: string | null;
  location: string | null;
  cover_url: string | null;
  /** Nippon Decimal Classification number ("933.7"): the genre. */
  ndc: string | null;
  note: string | null;
  created_at: string;
}

export type BookSort = "recent" | "title" | "author" | "published";

/**
 * Full-width and half-width, upper and lower case, katakana typed as
 * hiragana: all the same letters to someone looking for a book. NFKC
 * folds the widths, and the kana are folded by hand because Unicode
 * does not consider them the same.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60),
    )
    .replace(/[\s\-‐・]/g, "");
}

function haystack(book: ShelvedBook): string {
  return foldForSearch(
    [
      book.title,
      book.authors,
      book.publisher,
      book.isbn,
      book.location,
      book.note,
      // The genre by name, so "文学" or "マンガ" finds the books in it.
      ...(() => {
        const genre = ndcGenre(book.ndc);
        return genre ? [genre.className, genre.name] : [];
      })(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export function filterBooks(
  books: ShelvedBook[],
  {
    query,
    location,
    genre,
  }: {
    query: string;
    /**
     * One shelf: a location's name, `null` for the books with none
     * written down, or left out for every shelf.
     */
    location?: string | null;
    /**
     * One NDC class, by its digit ("9" for 文学); `null` for the books
     * with no NDC; left out for every genre.
     */
    genre?: string | null;
  },
): ShelvedBook[] {
  // Every word has to match somewhere, in any order: "orwell 早川" finds
  // the book whether the words are in the title, author or publisher.
  const words = query
    .split(/[\s　]+/)
    .map(foldForSearch)
    .filter((word) => word !== "");

  return books.filter((book) => {
    if (location !== undefined && shelfOf(book) !== location) return false;
    if (genre !== undefined && classOf(book) !== genre) return false;
    if (words.length === 0) return true;
    const text = haystack(book);
    return words.every((word) => text.includes(word));
  });
}

const collator = new Intl.Collator("ja", { numeric: true });

export function sortBooks(books: ShelvedBook[], sort: BookSort): ShelvedBook[] {
  const sorted = [...books];
  switch (sort) {
    case "title":
      return sorted.sort((a, b) => collator.compare(a.title, b.title));
    case "author":
      // A book with no author goes to the end, not the start: an empty
      // string sorts first, and a list that opens on the anonymous is
      // not sorted by author in any useful sense.
      return sorted.sort(
        (a, b) =>
          Number(!a.authors) - Number(!b.authors) ||
          collator.compare(a.authors ?? "", b.authors ?? "") ||
          collator.compare(a.title, b.title),
      );
    case "published":
      return sorted.sort(
        (a, b) =>
          Number(!a.published) - Number(!b.published) ||
          (b.published ?? "").localeCompare(a.published ?? ""),
      );
    case "recent":
    default:
      return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

export interface LibraryStats {
  total: number;
  /** Sum of the cover prices that were written down. */
  value: number;
}

export function libraryStats(books: ShelvedBook[]): LibraryStats {
  return books.reduce<LibraryStats>(
    (stats, book) => ({
      total: stats.total + 1,
      value: stats.value + (book.price ?? 0),
    }),
    { total: 0, value: 0 },
  );
}

/** Where a book is, with a blank or all-space location counted as none. */
function shelfOf(book: ShelvedBook): string | null {
  return book.location?.trim() || null;
}

export interface Shelf {
  /** `null` gathers the books with no location written down. */
  name: string | null;
  count: number;
}

/**
 * The places the books are, for the sidebar: fullest first, then by
 * name, with the books that have no place at the end.
 */
export function shelves(books: ShelvedBook[]): Shelf[] {
  const counts = new Map<string | null, number>();
  for (const book of books) {
    const name = shelfOf(book);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort(
      (a, b) =>
        Number(a.name === null) - Number(b.name === null) ||
        b.count - a.count ||
        collator.compare(a.name ?? "", b.name ?? ""),
    );
}

export interface ShelfOverview {
  total: number;
  value: number;
  authors: number;
  /** Added in the thirty days before `now`. */
  recent: number;
}

const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

/** The dashboard's numbers. */
export function shelfOverview(
  books: ShelvedBook[],
  now: Date = new Date(),
): ShelfOverview {
  const { total, value } = libraryStats(books);
  const authors = new Set(
    books
      .map((book) => book.authors?.trim())
      .filter((name): name is string => Boolean(name)),
  ).size;
  const since = now.getTime() - RECENT_MS;
  const recent = books.filter(
    (book) => new Date(book.created_at).getTime() >= since,
  ).length;
  return { total, value, authors, recent };
}

/** A book's NDC class digit, or null when it has no NDC. */
function classOf(book: ShelvedBook): string | null {
  return ndcGenre(book.ndc)?.classCode ?? null;
}

export interface GenreCount {
  /** The class digit, or `null` for the books with no NDC. */
  code: string | null;
  count: number;
}

/**
 * The genres on the shelf, in the NDC's own order (総記 to 文学), with
 * the books that have none at the end.
 */
export function genres(books: ShelvedBook[]): GenreCount[] {
  const counts = new Map<string | null, number>();
  for (const book of books) {
    const code = classOf(book);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts]
    .map(([code, count]) => ({ code, count }))
    .sort(
      (a, b) =>
        Number(a.code === null) - Number(b.code === null) ||
        (a.code ?? "").localeCompare(b.code ?? ""),
    );
}
