"use client";

/**
 * The places books are already kept, offered for a location field: a
 * <datalist> the field names with `list`, so typing narrows them the
 * browser's way, and a row of chips under it, because on a phone a
 * datalist shows nothing until something is typed and a place is
 * usually one of three or four that are already known.
 *
 * Choosing one fills the field; the field stays free text, so a new
 * place is typed as before.
 */
export function PlaceSuggestions({
  listId,
  places,
  value,
  onPick,
}: {
  listId: string;
  places: string[];
  value: string;
  onPick: (place: string) => void;
}) {
  if (places.length === 0) return null;
  const current = value.trim();
  return (
    <>
      <datalist id={listId}>
        {places.map((place) => (
          <option key={place} value={place} />
        ))}
      </datalist>
      <div
        role="group"
        aria-label="登録済みの場所"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]"
      >
        {places.map((place) => {
          const chosen = place === current;
          return (
            <button
              key={place}
              type="button"
              onClick={() => onPick(chosen ? "" : place)}
              aria-pressed={chosen}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors sm:py-1 sm:text-xs ${
                chosen
                  ? "border-accent bg-accent-soft text-text"
                  : "border-border text-text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              {place}
            </button>
          );
        })}
      </div>
    </>
  );
}
