"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { BookDialog } from "@/components/library/BookDialog";
import { READING_STATUS_LABEL } from "@/components/library/labels";
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
import type { ReadingStatus, ShelvedBook } from "@/domain/library/filter";

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
    "カメラの使用が許可されていません。ブラウザの設定で許可するか、下の欄に ISBN を入力してください。",
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
 * the session's shelf and reading status, so scanning thirty books is
 * thirty scans — the list is where mistakes get undone, afterwards,
 * rather than a confirm step standing between every book and the next.
 */
export function ScanScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const session = useRef(new ScanSession());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextId = useRef(1);
  const rowByIsbn = useRef(new Map<string, number>());
  const audio = useRef<AudioContext | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>("UNREAD");
  const [rows, setRows] = useState<Row[]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const [manualEntry, setManualEntry] = useState<Row | null>(null);

  // Read when a scan is processed, not when it is queued, so changing
  // the shelf mid-session applies to the next book rather than to
  // whichever were still waiting.
  const defaults = useRef({ location, readingStatus });
  useEffect(() => {
    defaults.current = { location, readingStatus };
  }, [location, readingStatus]);

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
        const { location, readingStatus } = defaults.current;
        const result = await addBookByIsbnAction(isbn, {
          location,
          reading_status: readingStatus,
        }).catch(() => null);

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

  function toggleCamera() {
    // The AudioContext has to be born inside a click, or iOS keeps it
    // muted for good. Starting the camera is the click that will do.
    if (!audio.current) {
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
    setCameraOn((on) => !on);
  }

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
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg/95 px-3 py-3 backdrop-blur sm:px-6">
        <Link
          href="/"
          aria-label="蔵書に戻る"
          className="-ml-1 rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          <ArrowLeftIcon />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-text">
          連続スキャン
        </h1>
        <Link
          href="/"
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-inverse transition-colors hover:bg-accent-hover"
        >
          完了
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
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
                <div className="h-1/3 w-4/5 rounded-lg border-2 border-accent/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            )}
            {!cameraOn && (
              <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 px-6 text-center sm:aspect-video">
                <p className="text-sm text-text-muted">
                  カメラで裏表紙の ISBN バーコード（978 / 979 で始まる上段）を
                  次々に読み取ります。
                </p>
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

          <button
            type="button"
            onClick={toggleCamera}
            className={`rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              cameraOn
                ? "border border-border text-text hover:bg-surface-hover"
                : "bg-accent text-inverse hover:bg-accent-hover"
            }`}
          >
            {cameraOn ? "カメラを止める" : "カメラでスキャン開始"}
          </button>

          <form onSubmit={submitManual} className="flex flex-col gap-1">
            <label
              htmlFor="scan-manual"
              className="text-xs font-medium text-text-muted"
            >
              バーコードリーダー / 手入力
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                id="scan-manual"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="send"
                placeholder="ISBN を読み取るか入力して Enter"
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md border border-border px-3 py-2 text-sm text-text transition-colors hover:bg-surface-hover"
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
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="scan-location"
              className="text-xs font-medium text-text-muted"
            >
              登録先の場所
            </label>
            <input
              id="scan-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="自宅 / 会社 / 本棚A"
              maxLength={100}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
            />
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-medium text-text-muted">
              読書状況
            </legend>
            <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
              {(Object.keys(READING_STATUS_LABEL) as ReadingStatus[]).map(
                (status) => (
                  <label
                    key={status}
                    className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-center text-sm transition-colors ${
                      readingStatus === status
                        ? "bg-accent-soft text-accent"
                        : "text-text-muted hover:bg-surface-hover"
                    }`}
                  >
                    <input
                      type="radio"
                      name="scan-reading-status"
                      value={status}
                      checked={readingStatus === status}
                      onChange={() => setReadingStatus(status)}
                      className="sr-only"
                    />
                    {READING_STATUS_LABEL[status]}
                  </label>
                ),
              )}
            </div>
          </fieldset>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-xs text-text-faint" aria-live="polite">
            追加 {counts.added ?? 0} ・ 登録済み {counts.duplicate ?? 0} ・
            見つからず {counts.not_found ?? 0}
            {counts.error ? ` ・ エラー ${counts.error}` : ""}
            {counts.pending ? ` ・ 処理中 ${counts.pending}` : ""}
          </p>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-text-muted">
              読み取った本がここに並びます。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
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

      {manualEntry && (
        <BookDialog
          initialIsbn={manualEntry.isbn}
          onClose={() => setManualEntry(null)}
          onSaved={(book) => update(manualEntry.id, { kind: "added", book })}
        />
      )}
    </div>
  );
}

const TONE: Record<RowState["kind"], string> = {
  pending: "border-border",
  added: "border-success/40",
  duplicate: "border-warning/40",
  not_found: "border-danger/40",
  undone: "border-border opacity-60",
  error: "border-danger/40",
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
      className={`flex items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 transition-shadow ${
        TONE[state.kind]
      } ${highlighted ? "ring-2 ring-accent" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">
          {book ? book.title : formatIsbn(row.isbn)}
        </p>
        <p className="truncate text-xs text-text-muted">
          {state.kind === "pending" && "書誌を取得しています…"}
          {state.kind === "added" &&
            [book?.authors, book?.publisher].filter(Boolean).join(" ・ ")}
          {state.kind === "duplicate" && "すでに登録されています"}
          {state.kind === "not_found" && "openBD に書誌がありません"}
          {state.kind === "undone" && "取り消しました"}
          {state.kind === "error" && state.message}
        </p>
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
              className="rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
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
            className="rounded-md border border-border px-2 py-1 text-xs text-text transition-colors hover:bg-surface-hover"
          >
            手入力
          </button>
        )}
        {state.kind === "error" && (
          <button
            type="button"
            onClick={() => onRetry(row)}
            className="rounded-md border border-border px-2 py-1 text-xs text-text transition-colors hover:bg-surface-hover"
          >
            再試行
          </button>
        )}
      </div>
    </li>
  );
}
