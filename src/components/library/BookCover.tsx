"use client";

import { useState } from "react";

/**
 * The National Diet Library's thumbnail for an ISBN. Covers far more
 * Japanese books than openBD's cover field does, so it is the fallback
 * for every book that has an ISBN and no stored cover.
 */
export function ndlThumbnail(isbn: string): string {
  return `https://ndlsearch.ndl.go.jp/thumbnail/${isbn}.jpg`;
}

const SIZE = {
  sm: "h-12 w-9 text-[10px]",
  md: "h-20 w-14 text-xs",
  lg: "h-36 w-24 text-sm",
} as const;

/**
 * A book's cover, or the nearest thing to one.
 *
 * Tries openBD's cover, then the NDL thumbnail by ISBN, then gives up
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
}: {
  title: string;
  isbn: string | null;
  coverUrl: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const sources = [coverUrl, isbn ? ndlThumbnail(isbn) : null].filter(
    (source): source is string => Boolean(source),
  );
  // Keyed on the sources so a book that gains a cover (an edit, a
  // lookup) starts again from the first one instead of staying on
  // whichever failed before.
  const key = sources.join("|");
  const [failed, setFailed] = useState({ key, count: 0 });
  const [loaded, setLoaded] = useState<string | null>(null);
  const attempt = failed.key === key ? failed.count : 0;
  const source = sources[attempt];

  const frame = `${SIZE[size]} shrink-0 overflow-hidden rounded-sm border border-border`;

  // The title card is always drawn, and the picture fades in on top of
  // it once it has actually arrived. A cover that is slow, or never
  // answers, leaves the card showing rather than an empty frame.
  return (
    <div
      aria-hidden="true"
      className={`${frame} relative flex items-center justify-center bg-surface-hover p-1 text-center leading-tight text-text-faint ${className}`}
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
              image.naturalWidth > 1 &&
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
            // The NDL answers some unknown ISBNs with a 1×1 placeholder
            // rather than a 404; treat that as the miss it is.
            if (event.currentTarget.naturalWidth <= 1) {
              setFailed({ key, count: attempt + 1 });
            } else {
              setLoaded(source);
            }
          }}
          className="lib-cover absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
