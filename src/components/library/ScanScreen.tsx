"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  BarcodeIcon,
  CameraIcon,
  CameraOffIcon,
  CheckIcon,
  CopyIcon,
  PencilIcon,
  RefreshIcon,
  UndoIcon,
} from "@/components/icons";
import { useRouter } from "next/navigation";
import { usePullToDismiss } from "@/hooks/usePullToDismiss";
import { SCAN_FROM_LIBRARY } from "@/components/library/navigation";
import {
  IconButton,
  Window,
  WindowBar,
  WindowFooter,
} from "@/components/library/Window";
import { Spinner } from "@/components/Spinner";
import { BookDialog } from "@/components/library/BookDialog";
import { BookCover } from "@/components/library/BookCover";
import { CameraLoading } from "@/components/library/CameraLoading";
import {
  knownShelf,
  refreshShelf,
  subscribeShelf,
} from "@/features/library/shelfStore";
import { PlaceSuggestions } from "@/components/library/PlaceSuggestions";
import { SearchLinks } from "@/components/library/SearchLinks";
import { useOpenedFromShell } from "@/components/library/scanShell";
import {
  useBarcodeScanner,
  type ScannerState,
} from "@/hooks/useBarcodeScanner";
import {
  addBookByIsbnAction,
  deleteBookAction,
  lookupIsbnAction,
} from "@/features/library/actions";
import { formatIsbn } from "@/domain/library/isbn";
import { isbnFromBarcode, ScanSession } from "@/domain/library/scan";
import { shelves, type ShelvedBook } from "@/domain/library/filter";
import type { BookDetails } from "@/domain/library/openbd";

/** Icon size inside an IconButton: larger under a thumb, 16px with a mouse. */
const ICON = "h-5 w-5 sm:h-4 sm:w-4";

/**
 * What a scan does: put the book on the shelf, or only look it up, to
 * search for it on Google or Amazon (in a shop, say, deciding whether
 * to buy it) without it landing in the library.
 */
type ScanMode = "add" | "search";

type RowState =
  | { kind: "pending" }
  | { kind: "added"; book: ShelvedBook }
  | { kind: "duplicate"; book: ShelvedBook }
  | { kind: "not_found" }
  | { kind: "undone"; book: ShelvedBook }
  | { kind: "error"; message: string }
  /** Looked up, not added. `owned` when the library already has it. */
  | { kind: "found"; book: BookDetails; owned: boolean }
  /** Looked up, not added, and the bibliographic databases know nothing. */
  | { kind: "unknown"; owned: boolean };

interface Row {
  id: number;
  isbn: string;
  mode: ScanMode;
  state: RowState;
}

const SCANNER_MESSAGE: Partial<Record<ScannerState, string>> = {
  starting: "カメラを起動しています…",
  denied:
    "カメラの使用が許可されていません。ブラウザの設定で許可するか、蔵書の「手入力で追加」をお使いください。",
  unavailable:
    "この端末ではカメラを使えません。蔵書の「手入力で追加」をお使いください。",
  error: "カメラを起動できませんでした。もう一度お試しください。",
};

/**
 * Scanning a shelf, one book after another, without stopping.
 *
 * Every barcode the camera produces goes into a queue that is worked through one ISBN at a time:
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
 * opens, and the books read come straight below it. Typing a book in is
 * the library's 手入力で追加, not a way into a scan.
 */
export function ScanScreen() {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);

  /**
   * Back to the library. When the library is where we came from, that
   * is a history step back rather than a new entry, so leaving scan
   * after scan does not stack up copies of the library behind it; when
   * /scan was opened directly, there is nothing to go back to and it
   * replaces itself with the library instead.
   */
  const leave = useCallback(() => {
    let fromLibrary = false;
    try {
      fromLibrary = sessionStorage.getItem(SCAN_FROM_LIBRARY) === "1";
      sessionStorage.removeItem(SCAN_FROM_LIBRARY);
    } catch {
      // Storage refused (private mode): take the safe route below.
    }
    if (fromLibrary) router.back();
    else router.replace("/");
  }, [router]);

  // On a phone the screen is a sheet, and pulled down it goes.
  usePullToDismiss({ sheetRef, scrollRef, onDismiss: leave });
  const videoRef = useRef<HTMLVideoElement>(null);
  // One per mode: a book looked up can still be scanned to add it.
  const sessions = useRef<Record<ScanMode, ScanSession>>({
    add: new ScanSession(),
    search: new ScanSession(),
  });
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextId = useRef(1);
  /** Keyed by mode and ISBN, as the sessions are. */
  const rowByIsbn = useRef(new Map<string, number>());
  const audio = useRef<AudioContext | null>(null);

  const [mode, setMode] = useState<ScanMode>("add");
  const [cameraOn, setCameraOn] = useState(true);
  const [location, setLocation] = useState("");

  // The places books are already kept, to offer for 登録先の場所: from
  // the shelf the library last fetched, or fetched here if there is none
  // (the scan screen opened directly), and kept fresh as adds land.
  const [shelfBooks, setShelfBooks] = useState<ShelvedBook[]>(
    () => knownShelf() ?? [],
  );
  useEffect(() => {
    const unsubscribe = subscribeShelf(setShelfBooks);
    if (!knownShelf()) void refreshShelf();
    return unsubscribe;
  }, []);
  const places = useMemo(
    () =>
      shelves(shelfBooks)
        .map((place) => place.name)
        .filter((name): name is string => name !== null),
    [shelfBooks],
  );
  // Read when a lookup lands, to say whether the book is already owned.
  const shelfNow = useRef(shelfBooks);
  useEffect(() => {
    shelfNow.current = shelfBooks;
  }, [shelfBooks]);
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
    (id: number, isbn: string, mode: ScanMode) => {
      queue.current = queue.current.then(async () => {
        if (mode === "search") {
          const result = await lookupIsbnAction(isbn).catch(() => null);
          const owned = shelfNow.current.some((book) => book.isbn === isbn);
          if (result?.success) {
            update(id, { kind: "found", book: result.data, owned });
            signal(true);
          } else if (result) {
            // Not found: the ISBN alone is still worth searching for.
            update(id, { kind: "unknown", owned });
            signal(false);
          } else {
            update(id, { kind: "error", message: "通信に失敗しました。" });
            signal(false);
          }
          return;
        }

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
          // The POST is done: fetch the shelf as it now stands, so the
          // library shows this book when it is gone back to.
          void refreshShelf();
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

  // Read when a barcode arrives, so the camera's callback stays put.
  const modeNow = useRef(mode);
  useEffect(() => {
    modeNow.current = mode;
  }, [mode]);

  /** Every source of an ISBN ends here: camera, scanner, keyboard. */
  const offer = useCallback(
    (text: string): boolean => {
      const isbn = isbnFromBarcode(text);
      if (!isbn) return false;
      const mode = modeNow.current;
      const key = `${mode}:${isbn}`;

      if (!sessions.current[mode].admit(isbn)) {
        // Already in the list: point at it instead of adding a row.
        setFlash(rowByIsbn.current.get(key) ?? null);
        return true;
      }

      const id = nextId.current++;
      rowByIsbn.current.set(key, id);
      setRows((current) => [
        { id, isbn, mode, state: { kind: "pending" } },
        ...current,
      ]);
      process(id, isbn, mode);
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
  const openedFromShell = useOpenedFromShell();

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

  async function undo(row: Row & { state: { kind: "added" } }) {
    const result = await deleteBookAction(row.state.book.id);
    if (!result.success) {
      update(row.id, { kind: "error", message: result.error.message });
      return;
    }
    sessions.current.add.forget(row.isbn);
    update(row.id, { kind: "undone", book: row.state.book });
    void refreshShelf();
  }

  function retry(row: Row) {
    update(row.id, { kind: "pending" });
    process(row.id, row.isbn, row.mode);
  }

  const counts = rows.reduce(
    (tally, row) => ({
      ...tally,
      [row.state.kind]: (tally[row.state.kind] ?? 0) + 1,
    }),
    {} as Partial<Record<RowState["kind"], number>>,
  );
  const searched = (counts.found ?? 0) + (counts.unknown ?? 0);

  return (
    <Window sheet settled={openedFromShell} sheetRef={sheetRef}>
      <WindowBar>
        <button
          type="button"
          onClick={leave}
          aria-label="蔵書に戻る"
          title="蔵書に戻る"
          className="-ml-1 flex h-11 w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text sm:h-auto sm:w-auto sm:p-1.5"
        >
          <ArrowLeftIcon />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base text-text sm:text-lg">
          連続スキャン
        </h1>
      </WindowBar>

      <main
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
      >
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
            {/* "idle" too: the first frame, before the camera is asked for,
                must not flash an empty box between the shell and this. */}
            {cameraOn &&
              (scannerState === "starting" || scannerState === "idle") && (
                <CameraLoading className="absolute inset-0 !aspect-auto rounded-none" />
              )}
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

          {/* Starting is said in the camera box itself. */}
          {cameraOn &&
            scannerState !== "starting" &&
            SCANNER_MESSAGE[scannerState] && (
              <p role="status" className="text-sm text-danger">
                {SCANNER_MESSAGE[scannerState]}
              </p>
            )}

          <div className="flex items-center gap-2">
            <ModeSwitch mode={mode} onChange={setMode} />
            <p className="min-w-0 flex-1 truncate text-xs text-text-muted">
              {mode === "search" && "蔵書には追加しません"}
            </p>
            <IconButton
              label={cameraOn ? "カメラを止める" : "カメラを再開"}
              tone="outline"
              onClick={() => setCameraOn((on) => !on)}
            >
              {cameraOn ? (
                <CameraOffIcon className={ICON} />
              ) : (
                <CameraIcon className={ICON} />
              )}
            </IconButton>
          </div>
          {mode === "add" && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="scan-location"
                className="px-1 text-[11px] font-semibold text-text-faint"
              >
                登録先の場所
              </label>
              <input
                id="scan-location"
                list="scan-location-places"
                autoComplete="off"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="例: 会社"
                maxLength={100}
                className="min-w-0 rounded-md border border-border bg-bg px-3 text-text placeholder:text-text-faint focus:border-accent focus:outline-none py-2.5 text-base sm:py-2 sm:text-sm"
              />
              <PlaceSuggestions
                listId="scan-location-places"
                places={places}
                value={location}
                onPick={setLocation}
              />
            </div>
          )}
        </section>

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
              {searched ? ` · 検索 ${searched}` : ""}
            </span>
          </>
        }
      >
        <IconButton label="完了して蔵書に戻る" tone="primary" onClick={leave}>
          <CheckIcon className={ICON} />
        </IconButton>
      </WindowFooter>

      {manualEntry && (
        <BookDialog
          places={places}
          initialIsbn={manualEntry.isbn}
          onClose={() => setManualEntry(null)}
          onSaved={(book) => {
            update(manualEntry.id, { kind: "added", book });
            void refreshShelf();
          }}
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
  found: "",
  unknown: "",
};

/** 登録 or 検索: what the next scan does. */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
}) {
  const options: [ScanMode, string][] = [
    ["add", "登録"],
    ["search", "検索"],
  ];
  return (
    <div
      role="radiogroup"
      aria-label="スキャンしたら"
      className="flex shrink-0 rounded-lg bg-bg/60 p-0.5"
    >
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => onChange(value)}
          className={`flex h-10 items-center rounded-[10px] px-3 text-sm transition-colors sm:h-7 sm:rounded-md sm:px-2.5 sm:text-xs ${
            mode === value
              ? "bg-surface-hover text-text"
              : "text-text-faint hover:text-text"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

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
    state.kind === "undone" ||
    state.kind === "found"
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
          {state.kind === "found" &&
            (state.owned ? "蔵書にあります" : (book?.authors ?? "著者不明"))}
          {state.kind === "unknown" &&
            (state.owned ? "蔵書にあります" : "書誌なし · ISBN で検索します")}
        </p>
        {(state.kind === "added" || state.kind === "found") && book && (
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
            <StatusMark
              label="追加しました"
              className="bg-success-soft text-success"
            >
              <CheckIcon className="h-4 w-4" />
            </StatusMark>
            <IconButton
              label="取り消す"
              onClick={() => onUndo(row as Row & { state: { kind: "added" } })}
            >
              <UndoIcon className={ICON} />
            </IconButton>
          </>
        )}
        {state.kind === "duplicate" && (
          <StatusMark
            label="すでに登録されています"
            className="bg-warning-soft text-warning"
          >
            <CopyIcon className="h-4 w-4" />
          </StatusMark>
        )}
        {state.kind === "not_found" && (
          <IconButton
            label="手入力で登録"
            tone="outline"
            onClick={() => onFillIn(row)}
          >
            <PencilIcon className={ICON} />
          </IconButton>
        )}
        {(state.kind === "found" || state.kind === "unknown") && (
          <SearchLinks
            compact
            book={{
              title: book?.title ?? row.isbn,
              authors: book?.authors ?? null,
              isbn: row.isbn,
            }}
          />
        )}
        {state.kind === "error" && (
          <IconButton
            label="再試行"
            tone="outline"
            onClick={() => onRetry(row)}
          >
            <RefreshIcon className={ICON} />
          </IconButton>
        )}
      </div>
    </li>
  );
}

/** A small round badge that is a state, not a button: it says, it does
 *  not do. The words are for screen readers and the hover tooltip. */
function StatusMark({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-full ${className}`}
    >
      {children}
    </span>
  );
}
