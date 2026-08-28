"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@/components/icons";
import { Chip, CHIP_CONTROL, CHIP_UNSET } from "@/components/ui/Chip";
import { stopLayerPress, useAnchoredLayer } from "@/hooks/useAnchoredLayer";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /**
   * Shown but not choosable — for a value the system can put a record
   * into but a person may not (a BLOCKED task), which still has to
   * appear or the control would display something that isn't in its
   * own list.
   */
  disabled?: boolean;
  /** Drawn before the label in the list, e.g. a status dot. */
  icon?: ReactNode;
}

/**
 * Every dropdown in the app.
 *
 * It used to be a real `<select>`, on the reasoning that the browser's
 * own control is keyboard- and screen-reader-native and gives a phone
 * its own OS picker for free. The last part is what killed it: the OS
 * picker is a white sheet with a blue tick in the middle of a black
 * canvas, and there is no styling hook that reaches inside it. A
 * control that looks like the app until you touch it is worse than one
 * that never claimed to.
 *
 * So the list is drawn here — which means the keyboard behaviour a
 * `<select>` gave away for free has to be built, and it is: Enter,
 * Space, Up, Down, Home, End, Escape, and type-ahead. The button
 * carries `combobox` semantics and the list `listbox`, so what a screen
 * reader is told is the same thing it was told before.
 *
 * Two shapes, because there are two places dropdowns appear:
 *
 *   chip    inline among a task's properties, where the value *is* the
 *           label and the pill is the only frame
 *   field   in a form, with its label above it and room for a hint
 */
export function Select<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  variant = "field",
  tone,
  leading,
  hint,
  disabled = false,
  className = "",
}: {
  id: string;
  /** Always required: sr-only in a chip, visible above a field. */
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  variant?: "chip" | "field";
  /** chip only: the colour the pill takes from its value. */
  tone?: string;
  /** chip only: something before the value, e.g. a status dot. */
  leading?: ReactNode;
  /** field only: a line under the control explaining the consequence. */
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const close = useCallback(() => {
    setIsOpen(false);
    buttonRef.current?.focus();
  }, []);

  const listRef = useAnchoredLayer({
    anchor: buttonRef,
    isOpen,
    onDismiss: close,
  });

  const selected = options.find((option) => option.value === value);
  const choosable = options.filter((option) => !option.disabled);

  function open(startAt?: number) {
    const current = options.findIndex((option) => option.value === value);
    setActiveIndex(startAt ?? (current === -1 ? 0 : current));
    setIsOpen(true);
  }

  /** Moves the highlight, skipping anything that can't be chosen. */
  function move(step: 1 | -1) {
    const last = options.length - 1;
    let next = activeIndex;
    for (let i = 0; i <= last; i += 1) {
      next = Math.min(last, Math.max(0, next + step));
      if (!options[next]?.disabled) break;
      if (next === 0 || next === last) break;
    }
    if (!options[next]?.disabled) setActiveIndex(next);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close();
  }

  /**
   * Type-ahead, which a `<select>` had and the replacement would have
   * quietly dropped. Letters within a second of each other build up a
   * prefix; a pause starts a new one.
   */
  function typeAhead(key: string) {
    const now = Date.now();
    typed.current.text = now - typed.current.at > 800 ? key : typed.current.text + key;
    typed.current.at = now;
    const match = choosable.find((option) =>
      option.label.toLowerCase().startsWith(typed.current.text.toLowerCase()),
    );
    if (!match) return;
    const index = options.indexOf(match);
    if (isOpen) setActiveIndex(index);
    else onChange(match.value);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) open();
      else move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!isOpen) return;
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) choose(activeIndex);
      else open();
      return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      typeAhead(event.key);
    }
  }

  const trigger = (
    <button
      ref={buttonRef}
      id={id}
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-controls={isOpen ? listId : undefined}
      disabled={disabled}
      onClick={() => (isOpen ? close() : open())}
      onKeyDown={onKeyDown}
      className={
        variant === "chip"
          ? `${CHIP_CONTROL} flex items-center gap-1 disabled:cursor-default`
          : "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2 text-left text-sm text-text transition-colors focus:border-accent focus:outline-none disabled:cursor-default disabled:opacity-50"
      }
    >
      <span className="truncate">{selected?.label ?? ""}</span>
      <ChevronDownIcon
        className={
          variant === "chip"
            ? "-mr-0.5 h-3 w-3 opacity-60"
            : "h-4 w-4 shrink-0 text-text-faint"
        }
      />
    </button>
  );

  const list =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <>
            {/*
             * Catches the press that closes the list. A layer with no
             * backdrop closes on the *next* click, which means the first
             * one both dismisses this and activates whatever it landed
             * on — and on a canvas that can be a node being dragged.
             */}
            <div
              className="fixed inset-0 z-[70]"
              onPointerDown={(event) => {
                event.preventDefault();
                stopLayerPress(event);
                close();
              }}
            />
            <div
              ref={listRef}
              onPointerDown={stopLayerPress}
              id={listId}
              role="listbox"
              aria-label={label}
              className="select-list fixed z-[71] max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(index)}
                    onPointerEnter={() =>
                      !option.disabled && setActiveIndex(index)
                    }
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-35 ${
                      index === activeIndex && !option.disabled
                        ? "bg-surface-hover"
                        : ""
                    } ${isSelected ? "text-accent" : "text-text"}`}
                  >
                    {option.icon}
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )
      : null;

  if (variant === "chip") {
    return (
      <>
        <Chip tone={tone ?? CHIP_UNSET} className={className}>
          {leading}
          <span className="sr-only" id={`${id}-label`}>
            {label}
          </span>
          {trigger}
        </Chip>
        {list}
      </>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      {trigger}
      {hint && <p className="text-xs text-text-faint">{hint}</p>}
      {list}
    </div>
  );
}
