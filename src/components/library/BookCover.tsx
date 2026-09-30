"use client";

import { useState } from "react";
import { coverCandidates, MIN_COVER_WIDTH } from "@/domain/library/cover";

const SIZE = {
  sm: "h-12 w-9 rounded-sm p-1 text-[10px]",
  md: "h-20 w-14 rounded-sm p-1 text-xs",
  lg: "h-36 w-24 rounded-sm p-1 text-sm",
  /** As wide as its container, at a book's proportions: the grid. */
  fill: "aspect-[2/3] w-full rounded-lg p-3 text-sm",
} as const;

/**
 * A book's cover, or the nearest thing to one.
 *
 * Tries the stored cover, then the cover hosts by ISBN (see
 * domain/library/cover), then gives up
 * and draws a plain spine-coloured card with the title on it — a row
 * with a hole where the picture should be reads as broken, and a card
 * reads as "no picture", which is the truth.
 *
 * A plain <img> rather than next/image: the pictures live on two other
 * sites, are already small, and routing every cover on the shelf
 * through the image optimiser would spend its quota resizing thumbnails.
 */
export function BookCover({
  title,
  isbn,
  coverUrl,
  size = "md",
  className = "",
  onZoom,
}: {
  /** Makes the cover a button that hands back the picture it shows. */
  onZoom?: (source: string) => void;
  title: string;
  isbn: string | null;
  coverUrl: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  // The stored cover first; then the same hosts the server checks, for
  // a book whose cover has not been looked up yet.
  const sources = [
    ...new Set([coverUrl, ...(isbn ? coverCandidates(isbn) : [])]),
  ].filter((source): source is string => Boolean(source));
  // Keyed on the sources so a book that gains a cover (an edit, a
  // lookup) starts again from the first one instead of staying on
  // whichever failed before.
  const key = sources.join("|");
  const [failed, setFailed] = useState({ key, count: 0 });
  const [loaded, setLoaded] = useState<string | null>(null);
  const attempt = failed.key === key ? failed.count : 0;
  const source = sources[attempt];

  const frame = `${SIZE[size]} shrink-0 overflow-hidden border border-border`;

  // The title card is always drawn, and the picture fades in on top of
  // it once it has actually arrived. A cover that is slow, or never
  // answers, leaves the card showing rather than an empty frame.
  const shown = loaded === source ? source : null;
  const zoomable = Boolean(onZoom && shown);
  const Frame = onZoom ? "button" : "div";

  return (
    <Frame
      {...(onZoom
        ? {
            type: "button" as const,
            onClick: () => shown && onZoom(shown),
            disabled: !zoomable,
            "aria-label": `「${title}」の表紙を拡大`,
            title: zoomable ? "表紙を拡大" : undefined,
          }
        : { "aria-hidden": true })}
      className={`${frame} relative flex items-center justify-center bg-surface-hover text-center leading-tight text-text-faint ${
        zoomable
          ? "cursor-zoom-in transition-transform active:scale-[0.97]"
          : ""
      } ${className}`}
    >
      <span className="line-clamp-4 break-all">{title}</span>
      {source && (
        // eslint-disable-next-line @next/next/no-img-element -- see above
        <img
          key={source}
          // An image already in the cache can finish before React
          // attaches onLoad; the ref catches that one so it does not
          // stay invisible.
          ref={(image) => {
            if (
              image?.complete &&
              image.naturalWidth >= MIN_COVER_WIDTH &&
              loaded !== source
            ) {
              setLoaded(source);
            }
          }}
          data-loaded={loaded === source}
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed({ key, count: attempt + 1 })}
          onLoad={(event) => {
            // The hosts answer a miss with a tiny placeholder rather than
            // a 404; treat that as the miss it is.
            if (event.currentTarget.naturalWidth < MIN_COVER_WIDTH) {
              setFailed({ key, count: attempt + 1 });
            } else {
              setLoaded(source);
            }
          }}
          className="lib-cover absolute inset-0 h-full w-full object-cover"
        />
      )}
    </Frame>
  );
}
