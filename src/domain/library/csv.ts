import type { ShelvedBook } from "@/domain/library/filter";
import { normalizeIsbn } from "@/domain/library/isbn";

/**
 * The shelf as a CSV file, and books back from one.
 *
 * Importing reads one thing: the first column of each row. A row whose
 * first cell is a number is a book to add by that ISBN; anything else
 * — a header, a blank line, a title someone typed — is passed over.
 * So the simplest file is a column of ISBNs, and the file this module
 * writes (ISBN first, a header the importer skips) reads straight back.
 */

/** RFC 4180 rows: quoted cells, "" for a quote, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface CsvIsbns {
  /** Valid ISBNs, 13-digit, each once, in the file's order. */
  isbns: string[];
  /** First cells that were numbers but not an ISBN (a typo, 9.78E+12). */
  invalid: string[];
  /** ISBNs the file had more than once, counted past the first. */
  repeated: number;
}

/** A first cell that is meant as a number: digits, hyphens, a final X. */
const NUMBERISH = /^[\d\s-]*\d[\d\s-]*[xX]?$/;

/** The ISBNs in a CSV's first column. */
export function isbnsFromCsv(text: string): CsvIsbns {
  const seen = new Set<string>();
  const result: CsvIsbns = { isbns: [], invalid: [], repeated: 0 };

  for (const row of parseCsv(text.replace(/^\uFEFF/, ""))) {
    // Full-width digits (９７８…) are digits too; Excel's ="978…" is
    // its way of keeping a long number from turning into 9.78E+12.
    const cell = (row[0] ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/^="(.*)"$/, "$1")
      .trim();
    if (!NUMBERISH.test(cell)) continue;

    const isbn = normalizeIsbn(cell);
    if (!isbn) result.invalid.push(cell);
    else if (seen.has(isbn)) result.repeated += 1;
    else {
      seen.add(isbn);
      result.isbns.push(isbn);
    }
  }
  return result;
}

const HEADER = [
  "isbn",
  "title",
  "authors",
  "publisher",
  "published",
  "price",
  "location",
  "ndc",
  "note",
  "created_at",
] as const;

function cellOf(value: string | number | null): string {
  if (value == null) return "";
  let text = String(value);
  // A spreadsheet would run a cell starting with = + - @ as a formula;
  // a leading apostrophe keeps it text. Only free text can start so.
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The shelf as CSV, ISBN first. With a BOM, so Excel opens it as
 * UTF-8 rather than mangling every Japanese title.
 */
export function booksToCsv(books: ShelvedBook[]): string {
  const lines = [
    HEADER.join(","),
    ...books.map((book) => HEADER.map((key) => cellOf(book[key])).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/**
 * A file's text, whichever of the two encodings it is likely in: UTF-8,
 * or the Shift_JIS a Japanese Excel saves as "CSV" by default.
 */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}
