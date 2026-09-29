import type { BookDetails } from "@/domain/library/openbd";

/**
 * Reading a book out of the National Diet Library's OpenSearch feed.
 *
 * openBD is the better first source — it has covers and publishers'
 * own data — but it is only as complete as what the publisher sent it,
 * and a price is the field most often missing (早川書房's backlist, for
 * one). The NDL catalogues nearly every book published in Japan and
 * records the cover price as printed, so it fills what openBD left.
 *
 *   GET https://ndlsearch.ndl.go.jp/api/opensearch?isbn=…&cnt=5
 *
 * The answer is RSS. A regular expression per field is enough to read
 * it: the fields are flat, and pulling in an XML parser for six tags on
 * the server would be the heavier way to be just as right.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(\w+);/g, (whole, name) => ENTITIES[name] ?? whole)
    .trim();
}

/** Every value of one tag inside a chunk of XML, in order. */
function all(xml: string, tag: string): string[] {
  const pattern = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
    "g",
  );
  return [...xml.matchAll(pattern)]
    .map((match) => decode(match[1]))
    .filter((value) => value !== "");
}

const first = (xml: string, tag: string) => all(xml, tag)[0] ?? null;

/**
 * "760円" → 760, "1,500円+税" → 1500, "本体2400円" → 2400. A price in
 * another currency (a foreign book's "$12.99") is not a yen price and
 * is dropped rather than read as 12.
 */
export function parsePrice(raw: string | null): number | null {
  if (!raw) return null;
  const text = raw.normalize("NFKC");
  if (/[$€£¥]|ドル|ユーロ|ポンド|USD|EUR|GBP/i.test(text.replace(/円/g, ""))) {
    return null;
  }
  const match = text.match(/(\d{1,3}(?:,\d{3})+|\d+)/);
  if (!match) return null;
  const price = Number(match[1].replace(/,/g, ""));
  return Number.isInteger(price) && price > 0 ? price : null;
}

/** "2011.6" / "2011-06" / "2011" → "2011-06" / "2011-06" / "2011". */
export function parseIssued(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.normalize("NFKC").match(/(\d{4})(?:[.\-/年](\d{1,2}))?/);
  if (!match) return null;
  return match[2] ? `${match[1]}-${match[2].padStart(2, "0")}` : match[1];
}

const ROLE =
  /[\s　]+(著|訳|編|作|編著|共著|監修|監訳|絵|文|原作|作画|画|写真|解説|著・訳|訳・解説)$/;

/** "フィリップ・K.ディック 著" → "フィリップ・K.ディック". */
function stripRole(name: string): string {
  return name.replace(ROLE, "").trim();
}

/**
 * The first record in the feed as BookDetails, or null when there is
 * none. When the NDL holds several records for one ISBN (reprints,
 * separate catalogue entries), the price is taken from the first that
 * has one — the fields describe the same book either way.
 */
export function parseNdlOpenSearch(xml: string): BookDetails | null {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(
    (match) => match[1],
  );
  const item = items[0];
  if (!item) return null;

  const title = first(item, "dc:title") ?? first(item, "title");
  if (!title) return null;

  const creators = all(item, "dc:creator").map(stripRole).filter(Boolean);
  const price =
    items
      .map((candidate) => parsePrice(first(candidate, "dcndl:price")))
      .find((value) => value !== null) ?? null;

  return {
    title,
    authors: creators.length > 0 ? creators.join(" / ") : null,
    publisher: first(item, "dc:publisher"),
    published: parseIssued(first(item, "dcterms:issued")),
    price,
    // The NDL's pictures are served by ISBN, not linked from the feed;
    // BookCover asks for them directly when there is no stored cover.
    cover_url: null,
  };
}

/**
 * openBD first, the NDL for whatever openBD did not have. Null only
 * when neither knows the book.
 */
export function mergeDetails(
  primary: BookDetails | null,
  fallback: BookDetails | null,
): BookDetails | null {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    title: primary.title,
    authors: primary.authors ?? fallback.authors,
    publisher: primary.publisher ?? fallback.publisher,
    published: primary.published ?? fallback.published,
    price: primary.price ?? fallback.price,
    cover_url: primary.cover_url ?? fallback.cover_url,
  };
}
