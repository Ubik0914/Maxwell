"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarcodeIcon,
  BookIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/icons";
import { Select } from "@/components/ui/Select";
import { logoutAction } from "@/features/auth/actions";
import { BookDialog } from "@/components/library/BookDialog";
import {
  filterBooks,
  libraryStats,
  sortBooks,
  type BookSort,
  type ShelvedBook,
} from "@/domain/library/filter";
import { formatIsbn } from "@/domain/library/isbn";

const SORT_OPTIONS: { value: BookSort; label: string }[] = [
  { value: "recent", label: "登録が新しい順" },
  { value: "title", label: "書名順" },
  { value: "author", label: "著者順" },
  { value: "published", label: "発売が新しい順" },
];

const yen = new Intl.NumberFormat("ja-JP");

/**
 * The library's one screen: the shelf and a search over it.
 *
 * Books come in by scanning — that is the one big button, and it leads
 * to /scan. Typing a book in by hand is still here for the ones with
 * no barcode, but as the quiet second option beside it.
 *
 * The books arrive rendered from the server and are kept here after
 * that. A save answers with the row as the database now holds it, so
 * the list is updated from that rather than by fetching the whole
 * shelf again for one changed book.
 */
export function LibraryScreen({
  initialBooks,
  userEmail,
}: {
  initialBooks: ShelvedBook[];
  userEmail: string;
}) {
  const [books, setBooks] = useState(initialBooks);
  const [query, setQuery] = useState("");
  const [lentOnly, setLentOnly] = useState(false);
  const [sort, setSort] = useState<BookSort>("recent");
  const [editing, setEditing] = useState<ShelvedBook | "new" | null>(null);

  const stats = useMemo(() => libraryStats(books), [books]);
  const shown = useMemo(
    () => sortBooks(filterBooks(books, { query, lentOnly }), sort),
    [books, query, lentOnly, sort],
  );

  function saved(book: ShelvedBook) {
    setBooks((current) =>
      current.some((b) => b.id === book.id)
        ? current.map((b) => (b.id === book.id ? book : b))
        : [book, ...current],
    );
  }

  function deleted(bookId: string) {
    setBooks((current) => current.filter((b) => b.id !== bookId));
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur sm:px-6">
        <BookIcon className="shrink-0 text-accent" />
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-text">
          蔵書
        </h1>
        <form action={logoutAction} className="shrink-0">
          <button
            type="submit"
            title={userEmail}
            className="rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            ログアウト
          </button>
        </form>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
        <Link
          href="/scan"
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3.5 text-base font-semibold text-inverse transition-colors hover:bg-accent-hover"
        >
          <BarcodeIcon className="h-5 w-5" />
          スキャンして本を追加
        </Link>

        <dl className="grid grid-cols-3 gap-2">
          {[
            ["蔵書", stats.total],
            ["貸出中", stats.lent],
            ["総額", `¥${yen.format(stats.value)}`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-surface px-3 py-2"
            >
              <dt className="text-[10px] font-semibold tracking-[0.14em] text-text-faint uppercase">
                {label}
              </dt>
              <dd className="mt-0.5 truncate text-lg font-semibold text-text tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="書名・著者・出版社・ISBN・場所で検索"
              aria-label="蔵書を検索"
              className="w-full rounded-md border border-border bg-surface py-2 pr-3 pl-9 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              id="library-sort"
              label="並び順"
              variant="chip"
              value={sort}
              options={SORT_OPTIONS}
              onChange={setSort}
            />
            <button
              type="button"
              onClick={() => setLentOnly((on) => !on)}
              aria-pressed={lentOnly}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                lentOnly
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-text-muted hover:bg-surface-hover"
              }`}
            >
              貸出中のみ
            </button>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              手入力
            </button>
          </div>
        </div>

        {books.length === 0 ? (
          <EmptyShelf />
        ) : shown.length === 0 ? (
          <p className="py-12 text-center text-sm text-text-muted">
            条件に合う本はありません。
          </p>
        ) : (
          <>
            <p className="text-xs text-text-faint">{shown.length} 冊</p>
            <BookTable books={shown} onOpen={setEditing} />
            <BookCards books={shown} onOpen={setEditing} />
          </>
        )}
      </main>

      {editing && (
        <BookDialog
          book={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={saved}
          onDeleted={deleted}
        />
      )}
    </div>
  );
}

function LentPill({ book }: { book: ShelvedBook }) {
  if (!book.lent_to) return null;
  return (
    <span className="inline-block max-w-full truncate rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] whitespace-nowrap text-accent">
      貸出: {book.lent_to}
    </span>
  );
}

/** Wide screens: a catalogue, one book per row. */
function BookTable({
  books,
  onOpen,
}: {
  books: ShelvedBook[];
  onOpen: (book: ShelvedBook) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-surface text-[11px] tracking-wide text-text-faint uppercase">
          <tr>
            <th className="w-[34%] px-3 py-2 font-semibold">書名</th>
            <th className="w-[20%] px-3 py-2 font-semibold">著者</th>
            <th className="w-[13%] px-3 py-2 font-semibold">出版社</th>
            <th className="w-[9%] px-3 py-2 font-semibold">発売</th>
            <th className="w-[10%] px-3 py-2 font-semibold">場所</th>
            <th className="w-[14%] px-3 py-2 font-semibold">貸出</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {books.map((book) => (
            <tr
              key={book.id}
              onClick={() => onOpen(book)}
              className="cursor-pointer transition-colors hover:bg-surface-hover"
            >
              <td className="px-3 py-2.5">
                {/* A real button in the first cell, so the row can be
                    reached and opened from the keyboard. */}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(book);
                  }}
                  className="block w-full truncate text-left font-medium text-text focus:outline-none focus-visible:text-accent"
                  title={book.title}
                >
                  {book.title}
                </button>
                {book.isbn && (
                  <span className="block truncate text-[11px] text-text-faint tabular-nums">
                    {formatIsbn(book.isbn)}
                  </span>
                )}
              </td>
              <td
                className="truncate px-3 py-2.5 text-text-muted"
                title={book.authors ?? ""}
              >
                {book.authors}
              </td>
              <td className="truncate px-3 py-2.5 text-text-muted">
                {book.publisher}
              </td>
              <td className="px-3 py-2.5 text-text-muted tabular-nums">
                {book.published}
              </td>
              <td className="truncate px-3 py-2.5 text-text-muted">
                {book.location}
              </td>
              <td className="px-3 py-2.5">
                <LentPill book={book} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Phones: a table this wide would scroll sideways, so a card per book. */
function BookCards({
  books,
  onOpen,
}: {
  books: ShelvedBook[];
  onOpen: (book: ShelvedBook) => void;
}) {
  return (
    <ul className="flex flex-col gap-2 sm:hidden">
      {books.map((book) => (
        <li key={book.id}>
          <button
            type="button"
            onClick={() => onOpen(book)}
            className="flex w-full flex-col gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
          >
            <span className="text-sm font-medium text-text">{book.title}</span>
            {(book.authors || book.publisher) && (
              <span className="text-xs text-text-muted">
                {[book.authors, book.publisher, book.published]
                  .filter(Boolean)
                  .join(" ・ ")}
              </span>
            )}
            <span className="flex items-center justify-between gap-2">
              <LentPill book={book} />
              {book.location && (
                <span className="truncate text-[11px] text-text-faint">
                  {book.location}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EmptyShelf() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
      <BookIcon className="text-text-faint" />
      <p className="text-sm text-text-muted">まだ本が登録されていません。</p>
      <p className="text-xs text-text-faint">
        上のボタンからバーコードを読み取って追加できます。
      </p>
    </div>
  );
}
