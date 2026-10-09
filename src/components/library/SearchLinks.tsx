import { SearchIcon } from "@/components/icons";
import { amazonSearchUrl, googleSearchUrl } from "@/domain/library/search";
import type { ShelvedBook } from "@/domain/library/filter";

/** Icon size inside a link: larger under a thumb, 16px with a mouse. */
const ICON = "h-5 w-5 sm:h-4 sm:w-4";

const LINK =
  "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border text-sm text-text-muted transition-[transform,background-color,color] hover:bg-surface-hover hover:text-text active:scale-[0.92] sm:h-8 sm:rounded-lg sm:px-2.5 sm:text-xs";

/**
 * "Google" and "Amazon": a book searched for on each, in a new tab.
 *
 * Links, not buttons: they go somewhere, and a middle click or a long
 * press should offer what they do for any link.
 *
 * `compact` drops the icons, for a list row on a phone where the title
 * beside them needs the width.
 */
export function SearchLinks({
  book,
  compact = false,
}: {
  book: Pick<ShelvedBook, "title" | "authors" | "isbn">;
  compact?: boolean;
}) {
  return (
    <>
      <a
        href={googleSearchUrl(book)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Googleで検索"
        title="Googleで検索"
        className={`${LINK} ${compact ? "px-2.5" : "px-3"}`}
      >
        {!compact && <SearchIcon className={ICON} />}
        Google
      </a>
      <a
        href={amazonSearchUrl(book)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Amazonで検索"
        title="Amazonで検索"
        className={`${LINK} ${compact ? "px-2.5" : "px-3"}`}
      >
        {!compact && <SearchIcon className={ICON} />}
        Amazon
      </a>
    </>
  );
}
