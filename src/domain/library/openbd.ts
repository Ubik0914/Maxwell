/**
 * Reading a book's details out of an openBD record.
 *
 * openBD (https://openbd.jp) is the free bibliographic API run by the
 * Japanese publishing industry: GET /v1/get?isbn=… answers with an
 * array holding one record per ISBN asked for, or null for one it does
 * not know. Its `summary` is the flattened part most apps need; the
 * price is only in the ONIX detail underneath.
 *
 * Kept pure — the fetch lives in the action — so the parsing that has
 * to survive whatever a publisher typed into the record can be tested
 * against records rather than against the network.
 */

export interface BookDetails {
  title: string;
  authors: string | null;
  publisher: string | null;
  published: string | null;
  price: number | null;
  /** openBD's cover image, when it has one. Always https. */
  cover_url: string | null;
}

type Unknown = Record<string, unknown> | null | undefined;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * openBD dates arrive as "20090725", "200907", "2009-07" or "2009". A
 * colophon rarely gives a day, and the one it gives is the printing's,
 * so the day is dropped and the month kept: "2009-07".
 */
export function formatPubdate(raw: unknown): string | null {
  const value = text(raw);
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length >= 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
  if (digits.length === 4) return digits;
  return null;
}

/**
 * "Orwell,George,1903-1950／著 高橋和久／訳" → "Orwell, George / 高橋和久".
 * The role after the slash and the life dates are what the catalogue
 * card has room for least.
 */
export function formatAuthors(raw: unknown): string | null {
  const value = text(raw);
  if (!value) return null;
  const names = value
    .split(/\s+(?=\S+／)|　/)
    .map((part) =>
      part
        .replace(/／.*$/, "")
        .replace(/,\s*\d{3,4}-(\d{3,4})?$/, "")
        .replace(/,\s*/g, ", ")
        .trim(),
    )
    .filter((part) => part !== "");
  return names.length > 0 ? names.join(" / ") : null;
}

/** openBD's cover link, if it is one we would put in an <img>. */
export function coverOf(raw: unknown): string | null {
  const value = text(raw);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" && url.href.length <= 500
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function priceOf(record: Unknown): number | null {
  const onix = record?.onix as Unknown;
  const supply = (onix?.ProductSupply as Unknown)?.SupplyDetail as Unknown;
  const prices = supply?.Price;
  if (!Array.isArray(prices)) return null;
  for (const price of prices) {
    const amount = Number((price as Unknown)?.PriceAmount);
    if (Number.isInteger(amount) && amount >= 0) return amount;
  }
  return null;
}

/** One element of openBD's response array, or null when it had no record. */
export function parseOpenBdRecord(record: unknown): BookDetails | null {
  if (!record || typeof record !== "object") return null;
  const summary = (record as Record<string, unknown>).summary as Unknown;
  const title = text(summary?.title);
  if (!title) return null;

  const volume = text(summary?.volume);
  return {
    title: volume ? `${title} ${volume}` : title,
    authors: formatAuthors(summary?.author),
    publisher: text(summary?.publisher),
    published: formatPubdate(summary?.pubdate),
    price: priceOf(record as Unknown),
    cover_url: coverOf(summary?.cover),
  };
}
