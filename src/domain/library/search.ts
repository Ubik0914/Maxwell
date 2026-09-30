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
  const author = book.authors?.split("/")[0]?.trim();
  const query = [book.title.trim(), author].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
