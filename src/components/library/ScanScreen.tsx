"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, BarcodeIcon, PlusIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import {
  FooterButton,
  Window,
  WindowBar,
  WindowFooter,
} from "@/components/library/Window";
import { Spinner } from "@/components/Spinner";
import { BookDialog } from "@/components/library/BookDialog";
import { BookCover } from "@/components/library/BookCover";
import {
  useBarcodeScanner,
  type ScannerState,
} from "@/hooks/useBarcodeScanner";
import {
  addBookByIsbnAction,
  deleteBookAction,
} from "@/features/library/actions";
import { formatIsbn } from "@/domain/library/isbn";
import { isbnFromBarcode, ScanSession } from "@/domain/library/scan";
import type { ShelvedBook } from "@/domain/library/filter";

type RowState =
  | { kind: "pending" }
  | { kind: "added"; book: ShelvedBook }
  | { kind: "duplicate"; book: ShelvedBook }
  | { kind: "not_found" }
  | { kind: "undone"; book: ShelvedBook }
  | { kind: "error"; message: string };

interface Row {
  id: number;
  isbn: string;
  state: RowState;
}

const SCANNER_MESSAGE: Partial<Record<ScannerState, string>> = {
  starting: "カメラを起動しています…",
  denied:
    "カメラの使用が許可されていません。ブラウザの設定で許可するか、下のバーコードリーダー / 手入力をお使いください。",
  unavailable:
    "この端末ではカメラを使えません。バーコードリーダーか手入力で続けられます。",
  error: "カメラを起動できませんでした。もう一度お試しください。",
};

/**
 * Scanning a shelf, one book after another, without stopping.
 *
 * Every barcode the camera (or a keyboard-wedge scanner, or a person)
 * produces goes into a queue that is worked through one ISBN at a time:
 * look it up, add it, report back, next. One at a time because two
 * copies of the same scan must not race each other into the table, and
 * because the list below reads in the order the books were scanned.
 *
 * Nothing waits on the person. A found book is added there and then with
 * the session's shelf, so scanning thirty books is
 * thirty scans — the list is where mistakes get undone, afterwards,
 * rather than a confirm step standing between every book and the next.
 *
 * Scanning is the way in, so the camera starts as soon as the page
 * opens. Typing — an ISBN, or a whole book with no barcode — is still
 * here, folded away below it.
 */
export function ScanScreen() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const session = useRef(new ScanSession());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextId = useRef(1);
  const rowByIsbn = useRef(new Map<string, number>());
  const audio = useRef<AudioContext | null>(null);

  const [cameraOn, setCameraOn] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [typingBook, setTypingBook] = useState(false);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const [manualEntry, setManualEntry] = useState<Row | null>(null);

  // Read when a scan is processed, not when it is queued, so changing
  // the shelf mid-session applies to the next book rather than to
  // whichever were still waiting.
  const defaults = useRef({ location });
  useEffect(() => {
    defaults.current = { location };
  }, [location]);

  const update = useCallback((id: number, state: RowState) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, state } : row)),
    );
  }, []);

  /** A short tone and a buzz: the book registered, move to the next. */
  const signal = useCallback((ok: boolean) => {
    try {
      navigator.vibrate?.(ok ? 60 : [40, 60, 40]);
      const context = audio.current;
      if (!context) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = ok ? 1320 : 440;
      gain.gain.value = 0.08;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + (ok ? 0.08 : 0.2));
    } catch {
      // Feedback is a nicety; a browser that refuses it loses nothing.
    }
  }, []);

  const process = useCallback(
    (id: number, isbn: string) => {
      queue.current = queue.current.then(async () => {
        const { location } = defaults.current;
        const result = await addBookByIsbnAction(isbn, { location }).catch(
          () => null,
        );

        if (!result || !result.success) {
          // The ISBN stays "seen": the book is probably still in front
          // of the camera, and forgetting it would add a fresh error row
          // every frame. The row's 再試行 is how it is tried again.
          update(id, {
            kind: "error",
            message: result?.error.message ?? "通信に失敗しました。",
          });
          signal(false);
          return;
        }

        const outcome = result.data;
        if (outcome.status === "added") {
          update(id, { kind: "added", book: outcome.book });
          signal(true);
        } else if (outcome.status === "duplicate") {
          update(id, { kind: "duplicate", book: outcome.book });
          signal(false);
        } else {
          update(id, { kind: "not_found" });
          signal(false);
        }
      });
    },
    [signal, update],
  );

  /** Every source of an ISBN ends here: camera, scanner, keyboard. */
  const offer = useCallback(
    (text: string): boolean => {
      const isbn = isbnFromBarcode(text);
      if (!isbn) return false;

      if (!session.current.admit(isbn)) {
        // Already in the list: point at it instead of adding a row.
        setFlash(rowByIsbn.current.get(isbn) ?? null);
        return true;
      }

      const id = nextId.current++;
      rowByIsbn.current.set(isbn, id);
      setRows((current) => [
        { id, isbn, state: { kind: "pending" } },
        ...current,
      ]);
      process(id, isbn);
      return true;
    },
    [process],
  );

  useEffect(() => {
    if (flash === null) return;
    const timer = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const scannerState = useBarcodeScanner(videoRef, offer, cameraOn);
  const cameraFailed =
    scannerState === "denied" ||
    scannerState === "unavailable" ||
    scannerState === "error";

  // The AudioContext has to be born inside a user gesture, or iOS keeps
  // it muted for good. The camera now starts on its own, so the first
  // touch anywhere on the page is the gesture that will do.
  useEffect(() => {
    function unlock() {
      if (audio.current) return;
      try {
        const Context =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        audio.current = Context ? new Context() : null;
      } catch {
        audio.current = null;
      }
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    if (manual.trim() === "") return;
    if (offer(manual)) {
      setManual("");
      setManualError(null);
    } else {
      setManualError("ISBN として読めませんでした。");
    }
    inputRef.current?.focus();
  }

  async function undo(row: Row & { state: { kind: "added" } }) {
    const result = await deleteBookAction(row.state.book.id);
    if (!result.success) {
      update(row.id, { kind: "error", message: result.error.message });
      return;
    }
    session.current.forget(row.isbn);
    update(row.id, { kind: "undone", book: row.state.book });
  }

  function retry(row: Row) {
    update(row.id, { kind: "pending" });
    process(row.id, row.isbn);
  }

  const counts = rows.reduce(
    (tally, row) => ({
      ...tally,
      [row.state.kind]: (tally[row.state.kind] ?? 0) + 1,
    }),
    {} as Partial<Record<RowState["kind"], number>>,
  );

  return (
    <Window>
      <WindowBar>
        <Link
          href="/"
          aria-label="蔵書に戻る"
          className="-ml-1 flex h-11 w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text sm:h-auto sm:w-auto sm:p-1.5"
        >
          <ArrowLeftIcon />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base text-text sm:text-lg">
          連続スキャン
        </h1>
      </WindowBar>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 sm:px-4">
        <section className="flex flex-col gap-3 rounded-lg bg-bg/40 p-3">
          <div className="relative overflow-hidden rounded-md bg-black">
            {/* Kept mounted while off so the stream has somewhere to go
                the moment it starts; hidden rather than removed. */}
            <video
              ref={videoRef}
              muted
              playsInline
              className={`aspect-[4/3] w-full object-cover sm:aspect-video ${
                cameraOn ? "" : "hidden"
              }`}
            />
            {cameraOn && scannerState === "running" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="lib-scan-frame h-1/3 w-4/5 rounded-lg border-2 border-accent/80" />
                <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/90">
                  上段の ISBN バーコードを枠に合わせてください
                </p>
              </div>
            )}
            {!cameraOn && (
              <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 px-6 text-center sm:aspect-video">
                <p className="text-sm text-text-muted">カメラは停止中です。</p>
              </div>
            )}
          </div>

          {cameraOn && SCANNER_MESSAGE[scannerState] && (
            <p
              role="status"
              className={`text-sm ${
                scannerState === "starting" ? "text-text-muted" : "text-danger"
              }`}
            >
              {SCANNER_MESSAGE[scannerState]}
            </p>
          )}

          <div className="flex items-center gap-2">
            <input
              id="scan-location"
              aria-label="登録先の場所"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="登録先の場所（例: 会社）"
              maxLength={100}
              className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-text placeholder:text-text-faint focus:border-accent focus:outline-none py-2.5 text-base sm:py-2 sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setCameraOn((on) => !on)}
              className="shrink-0 rounded-md border border-border text-text transition-colors hover:bg-surface-hover min-h-11 px-4 py-2.5 text-base sm:min-h-0 sm:px-3 sm:py-2 sm:text-sm"
            >
              {cameraOn ? "カメラ停止" : "カメラ再開"}
            </button>
          </div>
        </section>

        {/* The secondary ways in. Folded away while the camera works;
            opened for you when it cannot. */}
        <details
          open={manualOpen || cameraFailed}
          onToggle={(event) => setManualOpen(event.currentTarget.open)}
          className="group rounded-lg bg-bg/40 px-3 py-2"
        >
          <summary className="-mx-3 -my-2 flex min-h-11 cursor-pointer list-none items-center gap-1 px-3 py-2 text-sm text-text-muted select-none sm:min-h-0 sm:text-xs">
            <span className="inline-block transition-transform group-open:rotate-90">
              ›
            </span>{" "}
            バーコードリーダー / 手入力
          </summary>
          <form onSubmit={submitManual} className="mt-2 flex flex-col gap-1">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                id="scan-manual"
                aria-label="ISBN"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="send"
                placeholder="ISBN を読み取るか入力して Enter"
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-text placeholder:text-text-faint focus:border-accent focus:outline-none py-2.5 text-base sm:py-2 sm:text-sm"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md border border-border text-text transition-colors hover:bg-surface-hover min-h-11 px-4 py-2.5 text-base sm:min-h-0 sm:px-3 sm:py-2 sm:text-sm"
              >
                追加
              </button>
            </div>
            {manualError && (
              <p role="alert" className="text-xs text-danger">
                {manualError}
              </p>
            )}
          </form>
          <button
            type="button"
            onClick={() => setTypingBook(true)}
            className="mt-2 mb-1 flex min-h-11 items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text sm:min-h-0 sm:text-xs"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            バーコードの無い本を手入力で追加
          </button>
        </details>

        <section className="flex flex-col gap-2">
          <p className="px-1 text-[11px] font-semibold text-text-faint">
            読み取った本
          </p>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-text-muted">
              読み取った本がここに並びます。
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((row) => (
                <ScanRow
                  key={row.id}
                  row={row}
                  highlighted={flash === row.id}
                  onUndo={undo}
                  onRetry={retry}
                  onFillIn={setManualEntry}
                />
              ))}
            </ul>
          )}
        </section>
      </main>

      <WindowFooter
        left={
          <>
            <BarcodeIcon className="text-accent" />
            <span className="truncate" aria-live="polite">
              追加 {counts.added ?? 0} · 登録済み {counts.duplicate ?? 0} ·
              書誌なし {counts.not_found ?? 0}
              {counts.error ? ` · エラー ${counts.error}` : ""}
              {counts.pending ? ` · 処理中 ${counts.pending}` : ""}
            </span>
          </>
        }
      >
        <FooterButton onClick={() => router.push("/")} primary>
          完了
        </FooterButton>
      </WindowFooter>

      {typingBook && (
        <BookDialog
          onClose={() => setTypingBook(false)}
          onSaved={(book) => {
            const id = nextId.current++;
            if (book.isbn) {
              session.current.admit(book.isbn);
              rowByIsbn.current.set(book.isbn, id);
            }
            setRows((current) => [
              { id, isbn: book.isbn ?? "", state: { kind: "added", book } },
              ...current,
            ]);
          }}
        />
      )}

      {manualEntry && (
        <BookDialog
          initialIsbn={manualEntry.isbn}
          onClose={() => setManualEntry(null)}
          onSaved={(book) => update(manualEntry.id, { kind: "added", book })}
        />
      )}
    </Window>
  );
}

const TONE: Record<RowState["kind"], string> = {
  pending: "",
  added: "",
  duplicate: "",
  not_found: "",
  undone: "opacity-50",
  error: "",
};

function ScanRow({
  row,
  highlighted,
  onUndo,
  onRetry,
  onFillIn,
}: {
  row: Row;
  highlighted: boolean;
  onUndo: (row: Row & { state: { kind: "added" } }) => void;
  onRetry: (row: Row) => void;
  onFillIn: (row: Row) => void;
}) {
  const { state } = row;
  const book =
    state.kind === "added" ||
    state.kind === "duplicate" ||
    state.kind === "undone"
      ? state.book
      : null;

  return (
    <li
      // Every row drops in when it is queued, and glows once when the
      // book actually lands on the shelf: the class arrives with the
      // "added" state, so that is when its animation starts.
      className={`lib-scan-in flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover/60 ${
        state.kind === "added" ? "lib-scan-added" : ""
      } ${
        TONE[state.kind]
      } ${highlighted ? "bg-surface-hover ring-1 ring-accent" : ""}`}
    >
      <BookCover
        title={book?.title ?? formatIsbn(row.isbn)}
        isbn={row.isbn || null}
        coverUrl={book?.cover_url ?? null}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">
          {book ? book.title : formatIsbn(row.isbn)}
        </p>
        <p className="truncate text-xs text-text-muted">
          {state.kind === "pending" && "書誌を取得しています…"}
          {state.kind === "added" && (book?.authors ?? "著者不明")}
          {state.kind === "duplicate" && "すでに登録されています"}
          {state.kind === "not_found" && "書誌データベースに見つかりません"}
          {state.kind === "undone" && "取り消しました"}
          {state.kind === "error" && state.message}
        </p>
        {state.kind === "added" && book && (
          <p className="truncate text-[11px] text-text-faint">
            {[
              book.publisher,
              book.published,
              book.price == null
                ? null
                : `¥${book.price.toLocaleString("ja-JP")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {state.kind === "pending" && <Spinner />}
        {state.kind === "added" && (
          <>
            <span className="rounded-full border border-success/40 bg-success-soft px-2 py-0.5 text-[11px] text-success">
              追加
            </span>
            <button
              type="button"
              onClick={() => onUndo(row as Row & { state: { kind: "added" } })}
              className="rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text min-h-10 px-3 py-2 text-sm sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs"
            >
              取消
            </button>
          </>
        )}
        {state.kind === "duplicate" && (
          <span className="rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 text-[11px] text-warning">
            登録済み
          </span>
        )}
        {state.kind === "not_found" && (
          <button
            type="button"
            onClick={() => onFillIn(row)}
            className="rounded-md border border-border text-text transition-colors hover:bg-surface-hover min-h-10 px-3 py-2 text-sm sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs"
          >
            手入力
          </button>
        )}
        {state.kind === "error" && (
          <button
            type="button"
            onClick={() => onRetry(row)}
            className="rounded-md border border-border text-text transition-colors hover:bg-surface-hover min-h-10 px-3 py-2 text-sm sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs"
          >
            再試行
          </button>
        )}
      </div>
    </li>
  );
}
