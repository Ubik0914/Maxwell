"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { SearchIcon, TrashIcon } from "@/components/icons";
import { IconButton } from "@/components/library/Window";
import { BookCover } from "@/components/library/BookCover";
import { PlaceSuggestions } from "@/components/library/PlaceSuggestions";
import { normalizeIsbn } from "@/domain/library/isbn";
import { ndcGenre } from "@/domain/library/ndc";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import {
  createBookAction,
  deleteBookAction,
  lookupIsbnAction,
  searchTitleAction,
  updateBookAction,
} from "@/features/library/actions";
import type { ShelvedBook } from "@/domain/library/filter";
import type { BookCandidate } from "@/domain/library/ndl";

const yen = new Intl.NumberFormat("ja-JP");

const INPUT =
  "w-full rounded-md border border-border bg-bg px-3 text-text placeholder:text-text-faint focus:border-accent focus:outline-none py-2.5 text-base sm:py-2 sm:text-sm";
const LABEL = "text-xs font-medium text-text-muted";

interface Draft {
  isbn: string;
  title: string;
  authors: string;
  publisher: string;
  published: string;
  price: string;
  location: string;
  cover_url: string | null;
  ndc: string;
  note: string;
}

function draftOf(book?: ShelvedBook, initialIsbn?: string): Draft {
  return {
    isbn: book?.isbn ?? initialIsbn ?? "",
    title: book?.title ?? "",
    authors: book?.authors ?? "",
    publisher: book?.publisher ?? "",
    published: book?.published ?? "",
    price: book?.price == null ? "" : String(book.price),
    location: book?.location ?? "",
    cover_url: book?.cover_url ?? null,
    ndc: book?.ndc ?? "",
    note: book?.note ?? "",
  };
}

/**
 * Adding a book and editing one: the same fields, so one form.
 *
 * The ISBN comes first because it is the one thing on the back cover
 * that can fill in the rest — the search button asks for the title, author,
 * publisher, date and price, and anything it does not know stays
 * editable by hand.
 */
export function BookDialog({
  book,
  initialIsbn,
  confirmingDelete = false,
  onClose,
  onSaved,
  onDeleted,
  places = [],
}: {
  /** The book being edited, or undefined when adding one. */
  book?: ShelvedBook;
  /** Prefills the ISBN of a new book — a scan openBD had no record for. */
  initialIsbn?: string;
  /** Open with the delete confirmation already showing (⌘K's 削除). */
  confirmingDelete?: boolean;
  onClose: () => void;
  onSaved: (book: ShelvedBook) => void;
  onDeleted?: (bookId: string) => void;
  /** Places already in use, offered for 場所. */
  places?: string[];
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(book, initialIsbn));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(confirmingDelete);
  // A title search's answer: null before one, [] when it found nothing.
  const [candidates, setCandidates] = useState<BookCandidate[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEscapeKey(onClose, true, { exclusive: true });

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function lookup() {
    if (isLookingUp || draft.isbn.trim() === "") return;
    setIsLookingUp(true);
    setError(null);
    setNotice(null);

    const result = await lookupIsbnAction(draft.isbn);
    setIsLookingUp(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    // Only fill what openBD knew. A blank from the record must not wipe
    // out something already typed into the form.
    const found = result.data;
    setDraft((current) => ({
      ...current,
      isbn: found.isbn,
      title: found.title,
      authors: found.authors ?? current.authors,
      publisher: found.publisher ?? current.publisher,
      published: found.published ?? current.published,
      price: found.price == null ? current.price : String(found.price),
      cover_url: found.cover_url ?? current.cover_url,
      ndc: found.ndc ?? current.ndc,
    }));
    setNotice("openBD から書誌を読み込みました。");
  }

  /** Books that go by the title typed, to pick the right edition from. */
  async function searchTitle() {
    if (isSearching || draft.title.trim() === "") return;
    setIsSearching(true);
    setError(null);
    setNotice(null);

    const result = await searchTitleAction(draft.title);
    setIsSearching(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setCandidates(result.data);
  }

  /** Picking a candidate is picking a book: everything it knew replaces
   *  what was typed, except the fields only a person can know. */
  function pick(found: BookCandidate) {
    setDraft((current) => ({
      ...current,
      isbn: found.isbn,
      title: found.title,
      authors: found.authors ?? "",
      publisher: found.publisher ?? "",
      published: found.published ?? "",
      price: found.price == null ? "" : String(found.price),
      cover_url: found.cover_url,
      ndc: found.ndc ?? "",
    }));
    setCandidates(null);
    setNotice("候補から書誌を読み込みました。");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;

    const price = draft.price.replace(/[,，円\s]/g, "");
    if (price !== "" && !/^\d+$/.test(price)) {
      setError("価格は円単位の整数で入力してください");
      return;
    }

    setIsPending(true);
    setError(null);

    const fields = {
      ...draft,
      price: price === "" ? null : Number(price),
    };
    const result = book
      ? await updateBookAction(book.id, fields)
      : await createBookAction(fields);

    setIsPending(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    onSaved(result.data);
    onClose();
  }

  async function remove() {
    if (!book || isPending) return;
    setIsPending(true);
    const result = await deleteBookAction(book.id);
    setIsPending(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    onDeleted?.(book.id);
    onClose();
  }

  return (
    <Modal
      title={book ? "本を編集" : "手入力で追加"}
      subtitle={
        book
          ? undefined
          : "バーコードの無い本はここから。ISBN か書名で検索すると書誌が埋まります"
      }
      onClose={onClose}
      width="max-w-lg"
      fullScreenOnMobile
    >
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex gap-3">
          <BookCover
            title={draft.title || "表紙"}
            isbn={normalizeIsbn(draft.isbn)}
            coverUrl={draft.cover_url}
            size="lg"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="book-isbn" className={LABEL}>
                ISBN
              </label>
              <div className="flex gap-2">
                <input
                  id="book-isbn"
                  value={draft.isbn}
                  onChange={(event) =>
                    // A different ISBN is a different book: the cover that
                    // came with the old one no longer belongs here.
                    setDraft((current) => ({
                      ...current,
                      isbn: event.target.value,
                      cover_url: null,
                    }))
                  }
                  onKeyDown={(event) => {
                    // Enter in the ISBN box means "look it up", not "save a
                    // book that has no title yet". A barcode scanner types
                    // the digits and presses Enter, so this is also what
                    // makes a scanner work.
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void lookup();
                    }
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="978-4-15-120053-3"
                  autoFocus={!book && !initialIsbn}
                  className={INPUT}
                />
                <IconButton
                  label="ISBN から書誌を探す"
                  tone="outline"
                  onClick={() => void lookup()}
                  disabled={isLookingUp || draft.isbn.trim() === ""}
                >
                  {isLookingUp ? (
                    <Spinner />
                  ) : (
                    <SearchIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                  )}
                </IconButton>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="book-title" className={LABEL}>
                書名 <span className="text-danger">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="book-title"
                  value={draft.title}
                  onChange={(event) => set("title", event.target.value)}
                  onKeyDown={(event) => {
                    // Adding a book, Enter here asks for candidates: the
                    // title alone is seldom the whole of what to save.
                    if (event.key === "Enter" && !book) {
                      event.preventDefault();
                      void searchTitle();
                    }
                  }}
                  autoFocus={Boolean(initialIsbn)}
                  required
                  maxLength={500}
                  className={INPUT}
                />
                <IconButton
                  label="書名から候補を探す"
                  tone="outline"
                  onClick={() => void searchTitle()}
                  disabled={isSearching || draft.title.trim() === ""}
                >
                  {isSearching ? (
                    <Spinner />
                  ) : (
                    <SearchIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                  )}
                </IconButton>
              </div>
            </div>
          </div>
        </div>

        {candidates && (
          <Candidates
            candidates={candidates}
            onPick={pick}
            onDismiss={() => setCandidates(null)}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="book-authors" className={LABEL}>
              著者
            </label>
            <input
              id="book-authors"
              value={draft.authors}
              onChange={(event) => set("authors", event.target.value)}
              maxLength={500}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="book-publisher" className={LABEL}>
              出版社
            </label>
            <input
              id="book-publisher"
              value={draft.publisher}
              onChange={(event) => set("publisher", event.target.value)}
              maxLength={200}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="book-published" className={LABEL}>
              発売日
            </label>
            <input
              id="book-published"
              value={draft.published}
              onChange={(event) => set("published", event.target.value)}
              placeholder="2009-07"
              maxLength={20}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="book-price" className={LABEL}>
              価格（円）
            </label>
            <input
              id="book-price"
              value={draft.price}
              onChange={(event) => set("price", event.target.value)}
              inputMode="numeric"
              placeholder="860"
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="book-location" className={LABEL}>
              場所
            </label>
            <input
              id="book-location"
              list="book-location-places"
              value={draft.location}
              onChange={(event) => set("location", event.target.value)}
              placeholder="自宅 / 会社 / 本棚A"
              maxLength={100}
              autoComplete="off"
              className={INPUT}
            />
            <PlaceSuggestions
              listId="book-location-places"
              places={places}
              value={draft.location}
              onPick={(place) => set("location", place)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="book-ndc" className={LABEL}>
              ジャンル（NDC）
            </label>
            <input
              id="book-ndc"
              value={draft.ndc}
              onChange={(event) => set("ndc", event.target.value)}
              inputMode="decimal"
              placeholder="913.6"
              maxLength={20}
              autoComplete="off"
              className={INPUT}
            />
            {ndcGenre(draft.ndc) && (
              <p className="text-xs text-text-faint">
                {ndcGenre(draft.ndc)?.name || ndcGenre(draft.ndc)?.className}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="book-note" className={LABEL}>
            メモ
          </label>
          <textarea
            id="book-note"
            value={draft.note}
            onChange={(event) => set("note", event.target.value)}
            rows={3}
            maxLength={5000}
            className={`${INPUT} resize-y`}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger select-text">
            {error}
          </p>
        )}
        {notice && !error && (
          <p role="status" className="text-sm text-success">
            {notice}
          </p>
        )}

        {/* Pinned to the bottom of the page on a phone, so 保存 is never
            a scroll away from whichever field was just filled in. */}
        <div className="sticky bottom-0 -mx-4 mt-1 flex items-center justify-between gap-2 border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          {book && confirmDelete ? (
            // Confirming takes the whole bar: the question and its two
            // answers, with 保存 out of the way until it is settled.
            <>
              <p className="min-w-0 truncate text-sm text-text-muted">
                この本を削除しますか？
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-11 rounded-md px-4 py-2.5 text-base whitespace-nowrap text-text-muted hover:text-text sm:min-h-0 sm:px-3 sm:py-2 sm:text-sm"
                >
                  やめる
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={isPending}
                  className="min-h-11 rounded-md bg-danger px-4 py-2.5 text-base font-medium whitespace-nowrap text-inverse transition-colors hover:bg-danger-hover disabled:opacity-50 sm:min-h-0 sm:px-3 sm:py-2 sm:text-sm"
                >
                  削除する
                </button>
              </div>
            </>
          ) : (
            <>
              {book ? (
                <IconButton
                  label="削除"
                  tone="danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  <TrashIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                </IconButton>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex min-h-11 items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-base font-medium whitespace-nowrap text-inverse transition-colors hover:bg-accent-hover disabled:opacity-50 sm:min-h-0 sm:px-4 sm:py-2 sm:text-sm"
                >
                  {isPending && <Spinner />}
                  {book ? "保存" : "登録"}
                </button>
              </div>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

/** The title search's answer: one row per edition, in the NDL's order. */
function Candidates({
  candidates,
  onPick,
  onDismiss,
}: {
  candidates: BookCandidate[];
  onPick: (candidate: BookCandidate) => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="書名の候補"
      className="lib-detail rounded-lg border border-border bg-bg/40"
    >
      <div className="flex items-center justify-between px-3 pt-2 pb-1 text-xs text-text-faint">
        <span>
          {candidates.length === 0
            ? "候補が見つかりませんでした"
            : `候補 ${candidates.length}件 · タップで入力`}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded px-1.5 py-1 hover:bg-surface-hover hover:text-text"
        >
          閉じる
        </button>
      </div>
      {candidates.length > 0 && (
        <ul className="max-h-72 overflow-y-auto overscroll-contain p-1">
          {candidates.map((candidate) => {
            const line = [
              candidate.publisher,
              candidate.published,
              candidate.price == null
                ? null
                : `¥${yen.format(candidate.price)}`,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={candidate.isbn}>
                <button
                  type="button"
                  onClick={() => onPick(candidate)}
                  className="lib-select flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-hover"
                >
                  <BookCover
                    title={candidate.title}
                    isbn={candidate.isbn}
                    coverUrl={candidate.cover_url}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm text-text">
                      {candidate.title}
                    </span>
                    {candidate.authors && (
                      <span className="block truncate text-xs text-text-muted">
                        {candidate.authors}
                      </span>
                    )}
                    {line && (
                      <span className="block truncate text-[11px] text-text-faint">
                        {line}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
