"use client";

import { useState } from "react";
import { RefreshIcon, TrashIcon } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { BookCover } from "@/components/library/BookCover";
import { PlaceSuggestions } from "@/components/library/PlaceSuggestions";
import type { ShelvedBook } from "@/domain/library/filter";

const yen = new Intl.NumberFormat("ja-JP");

/**
 * The detail pane for several books at once (shift- or ⌘-clicked): what
 * is chosen, and what can be done to all of it — move to one place,
 * re-fetch the bibliography, delete. Adding has no part here; a book is
 * added one at a time, by scanning or by hand.
 */
export function BulkPanel({
  books,
  places,
  busy,
  onMove,
  onRefresh,
  onDelete,
  onClear,
  locationRef,
}: {
  books: ShelvedBook[];
  places: string[];
  /** Which of the actions is running, if any. */
  busy: "move" | "refresh" | "delete" | null;
  onMove: (location: string) => void;
  onRefresh: () => void;
  onDelete: () => void;
  onClear: () => void;
  /** So ⌘K's 場所を変更 can put the cursor straight in the field. */
  locationRef?: React.Ref<HTMLInputElement>;
}) {
  const [location, setLocation] = useState("");
  const [confirming, setConfirming] = useState(false);
  const value = books.reduce((sum, book) => sum + (book.price ?? 0), 0);

  return (
    // Padded in the xl pane; the md–xl sheet pads it itself.
    <div className="flex flex-col gap-5 xl:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-text">
          {books.length}冊を選択中
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-1.5 py-1 text-xs text-text-faint hover:bg-surface-hover hover:text-text"
        >
          選択を解除
        </button>
      </div>

      {/* Read: the covers fanned out, and the titles. */}
      <div className="flex -space-x-5">
        {books.slice(0, 7).map((book) => (
          <BookCover
            key={book.id}
            title={book.title}
            isbn={book.isbn}
            coverUrl={book.cover_url}
            size="md"
            className="shadow-[0_6px_18px_rgba(0,0,0,0.5)]"
          />
        ))}
      </div>
      <ul className="max-h-48 overflow-y-auto text-sm text-text-muted">
        {books.map((book) => (
          <li key={book.id} className="truncate py-0.5">
            {book.title}
          </li>
        ))}
      </ul>
      {value > 0 && (
        <p className="-mt-3 text-xs text-text-faint">
          合計 ¥{yen.format(value)}
        </p>
      )}

      {/* Update: one place for all of them. */}
      <form
        className="flex flex-col gap-2 border-t border-border pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          onMove(location);
        }}
      >
        <label htmlFor="bulk-location" className="text-xs text-text-faint">
          場所をまとめて変更
        </label>
        <div className="flex gap-2">
          <input
            id="bulk-location"
            ref={locationRef}
            list="bulk-location-places"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="空欄で場所を外す"
            maxLength={100}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-inverse hover:bg-accent-hover disabled:opacity-50"
          >
            {busy === "move" && <Spinner />}
            変更
          </button>
        </div>
        <PlaceSuggestions
          listId="bulk-location-places"
          places={places}
          value={location}
          onPick={setLocation}
        />
      </form>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy !== null}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-50"
        >
          {busy === "refresh" ? <Spinner /> : <RefreshIcon />}
          書誌を再取得
        </button>

        {/* Delete, behind a second press. */}
        {confirming ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDelete}
              disabled={busy !== null}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-danger px-3 text-xs font-medium text-inverse hover:bg-danger-hover disabled:opacity-50"
            >
              {busy === "delete" ? <Spinner /> : <TrashIcon />}
              {books.length}冊を削除
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-text-faint hover:text-text"
            >
              やめる
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
            className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs text-danger hover:bg-danger-soft disabled:opacity-50"
          >
            <TrashIcon />
            削除…
          </button>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-text-faint">
        Shift＋クリック・Shift＋矢印で範囲を、⌘／Ctrl＋クリックで1冊ずつ選べます。Esc
        で解除。
      </p>
    </div>
  );
}
