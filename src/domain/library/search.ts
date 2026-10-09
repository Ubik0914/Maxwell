import type { ShelvedBook } from "./filter";

/**
 * A Google search for a book: its title and its first author.
 *
 * Only the first author, because the rest of the field is usually the
 * translator ("Orwell, George / 高橋和久"), and a query with every name
 * in it matches fewer pages about the book, not more. Not the ISBN: a
 * person reading the results wants reviews and the author's other
 * books, which a bare number seldom finds.
 */
export function googleSearchUrl(
  book: Pick<ShelvedBook, "title" | "authors">,
): string {
  return `https://www.google.com/search?q=${encodeURIComponent(titleAndAuthor(book))}`;
}

/**
 * An Amazon (amazon.co.jp, books) search for a book: its ISBN when it
 * has one, else its title and first author.
 *
 * Unlike Google, the ISBN is what a person on Amazon wants: it lands on
 * this very edition, where a title search lists every edition, the
 * Kindle one and unrelated books with the same words.
 */
export function amazonSearchUrl(
  book: Pick<ShelvedBook, "title" | "authors" | "isbn">,
): string {
  const query = book.isbn?.trim() || titleAndAuthor(book);
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(query)}&i=stripbooks`;
}

function titleAndAuthor(book: Pick<ShelvedBook, "title" | "authors">): string {
  const author = book.authors?.split("/")[0]?.trim();
  return [book.title.trim(), author].filter(Boolean).join(" ");
}
