"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { SearchIcon } from "@/components/icons";
import { BookCover } from "@/components/library/BookCover";
import { normalizeIsbn } from "@/domain/library/isbn";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import {
  createBookAction,
  deleteBookAction,
  lookupIsbnAction,
  updateBookAction,
} from "@/features/library/actions";
import type { ShelvedBook } from "@/domain/library/filter";

const INPUT =
  "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none";
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
  lent_to: string;
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
    lent_to: book?.lent_to ?? "",
    note: book?.note ?? "",
  };
}

/**
 * Adding a book and editing one: the same fields, so one form.
 *
 * The ISBN comes first because it is the one thing on the back cover
 * that can fill in the rest — "探す" asks openBD for the title, author,
 * publisher, date and price, and anything it does not know stays
 * editable by hand.
 */
export function BookDialog({
  book,
  initialIsbn,
  onClose,
  onSaved,
  onDeleted,
}: {
  /** The book being edited, or undefined when adding one. */
  book?: ShelvedBook;
  /** Prefills the ISBN of a new book — a scan openBD had no record for. */
  initialIsbn?: string;
  onClose: () => void;
  onSaved: (book: ShelvedBook) => void;
  onDeleted?: (bookId: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(book, initialIsbn));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    }));
    setNotice("openBD から書誌を読み込みました。");
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
          : "バーコードの無い本はここから。ISBN があれば「探す」で書誌が埋まります"
      }
      onClose={onClose}
      width="max-w-lg"
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
                <button
                  type="button"
                  onClick={() => void lookup()}
                  disabled={isLookingUp || draft.isbn.trim() === ""}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-text transition-colors hover:bg-surface-hover disabled:opacity-50"
                >
                  {isLookingUp ? <Spinner /> : <SearchIcon />}
                  探す
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="book-title" className={LABEL}>
                書名 <span className="text-danger">*</span>
              </label>
              <input
                id="book-title"
                value={draft.title}
                onChange={(event) => set("title", event.target.value)}
                autoFocus={Boolean(initialIsbn)}
                required
                maxLength={500}
                className={INPUT}
              />
            </div>
          </div>
        </div>

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
              value={draft.location}
              onChange={(event) => set("location", event.target.value)}
              placeholder="自宅 / 会社 / 本棚A"
              maxLength={100}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="book-lent-to" className={LABEL}>
              貸出先
            </label>
            <input
              id="book-lent-to"
              value={draft.lent_to}
              onChange={(event) => set("lent_to", event.target.value)}
              placeholder="空欄なら手元にある"
              maxLength={100}
              className={INPUT}
            />
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

        <div className="mt-1 flex items-center justify-between gap-2">
          {book ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={isPending}
                  className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-inverse transition-colors hover:bg-danger-hover disabled:opacity-50"
                >
                  削除する
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-3 py-2 text-sm text-text-muted hover:text-text"
                >
                  やめる
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-md px-3 py-2 text-sm text-danger transition-colors hover:bg-danger-soft"
              >
                削除
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm text-text-muted hover:text-text"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {isPending && <Spinner />}
              {book ? "保存" : "登録"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
