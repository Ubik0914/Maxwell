"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  WEEKDAYS,
  monthGrid,
  monthLabel,
  parseIsoDate,
  shiftMonth,
  toIsoDate,
  type YearMonth,
} from "@/lib/date/calendar";
import { ArrowLeftIcon, CloseIcon } from "@/components/icons";
import { Chip, CHIP_SET, CHIP_UNSET } from "@/components/ui/Chip";
import { stopLayerPress, useAnchoredLayer } from "@/hooks/useAnchoredLayer";

/** The month to show when there is no date yet. */
function monthOf(iso: string, today: string): YearMonth {
  const parsed = parseIsoDate(iso) ?? parseIsoDate(today);
  return parsed
    ? { year: parsed.year, month: parsed.month }
    : { year: 2026, month: 1 };
}

/**
 * A due date, picked from a calendar the app draws itself.
 *
 * `<input type="date">` was doing this before, and on a phone that
 * means the OS date sheet: a white wheel in the middle of a black
 * canvas, with no styling hook that reaches inside it. It also renders
 * its own "mm/dd/yyyy" placeholder when empty, which shouts about a
 * value that isn't set, and the format it shows is the OS locale's
 * rather than the app's.
 *
 * The calendar is small on purpose — a month, two arrows, and a way to
 * clear. Anything a task's due date needs is within a month or two of
 * now, and the cases that aren't are better served by the keyboard than
 * by a year grid nobody would find.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
  today,
  className = "",
}: {
  id: string;
  label: string;
  /** ISO `YYYY-MM-DD`, or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  /** Today, as an ISO date — passed in so nothing here reads the clock. */
  today: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [at, setAt] = useState<YearMonth>(() => monthOf(value, today));
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    buttonRef.current?.focus();
  }, []);

  const layerRef = useAnchoredLayer({
    anchor: buttonRef,
    isOpen,
    onDismiss: close,
  });

  const selected = parseIsoDate(value);
  const cells = monthGrid(at);

  function open() {
    setAt(monthOf(value, today));
    setIsOpen(true);
  }

  function pick(day: number) {
    onChange(toIsoDate(at.year, at.month, day));
    close();
  }

  return (
    <>
      <Chip tone={value ? CHIP_SET : CHIP_UNSET} className={className}>
        <span className="sr-only" id={`${id}-label`}>
          {label}
        </span>
        <button
          ref={buttonRef}
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={() => (isOpen ? close() : open())}
          className="cursor-pointer bg-transparent text-xs text-current focus:outline-none"
        >
          {selected
            ? `${MONTH_SHORT[selected.month - 1]} ${selected.day}${
                String(selected.year) === today.slice(0, 4)
                  ? ""
                  : ` ${selected.year}`
              }`
            : label}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="-mr-1 rounded-full p-0.5 text-current opacity-50 transition-opacity hover:opacity-100"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        )}
      </Chip>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[70]"
              onPointerDown={(event) => {
                event.preventDefault();
                stopLayerPress(event);
                close();
              }}
            />
            <div
              ref={layerRef}
              onPointerDown={stopLayerPress}
              role="dialog"
              aria-label={label}
              className="select-list fixed z-[71] w-[17rem] rounded-xl border border-border bg-surface p-3 shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
            >
              <div className="flex items-center justify-between">
                <MonthButton
                  label="Previous month"
                  onClick={() => setAt(shiftMonth(at, -1))}
                >
                  <ArrowLeftIcon className="h-3.5 w-3.5" />
                </MonthButton>
                <span
                  aria-live="polite"
                  className="text-sm font-medium text-text"
                >
                  {monthLabel(at)}
                </span>
                <MonthButton
                  label="Next month"
                  onClick={() => setAt(shiftMonth(at, 1))}
                >
                  <ArrowLeftIcon className="h-3.5 w-3.5 rotate-180" />
                </MonthButton>
              </div>

              <div className="mt-2 grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((day) => (
                  <span
                    key={day}
                    aria-hidden="true"
                    className="py-1 text-center text-[10px] tracking-wider text-text-faint uppercase"
                  >
                    {day}
                  </span>
                ))}

                {cells.map((day, index) => {
                  if (day === null) {
                    return <span key={`blank-${index}`} aria-hidden="true" />;
                  }
                  const iso = toIsoDate(at.year, at.month, day);
                  const isSelected = iso === value;
                  const isToday = iso === today;
                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={iso}
                      onClick={() => pick(day)}
                      className={`flex h-9 items-center justify-center rounded-lg text-sm transition-colors ${
                        isSelected
                          ? "bg-accent font-semibold text-inverse"
                          : isToday
                            ? "text-accent hover:bg-surface-hover"
                            : "text-text hover:bg-surface-hover"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange(today);
                    close();
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    close();
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:text-text"
                >
                  Clear
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function MonthButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
    >
      {children}
    </button>
  );
}
