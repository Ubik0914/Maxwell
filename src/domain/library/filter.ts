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
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export function filterBooks(
  books: ShelvedBook[],
  { query }: { query: string },
): ShelvedBook[] {
  // Every word has to match somewhere, in any order: "orwell 早川" finds
  // the book whether the words are in the title, author or publisher.
  const words = query
    .split(/[\s　]+/)
    .map(foldForSearch)
    .filter((word) => word !== "");

  return books.filter((book) => {
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
