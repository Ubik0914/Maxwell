/**
 * ISBNs, as people actually type and scan them.
 *
 * A book has one number and two spellings of it — ISBN-10 for anything
 * printed before 2007, ISBN-13 for everything after — plus whatever
 * hyphens and spaces the cover happened to use. The library stores one
 * spelling (13 digits, no hyphens) so a lookup and a duplicate check are
 * both a plain string compare.
 */

/** The 13-digit form, or null when the input is not a valid ISBN. */
export function normalizeIsbn(input: string): string | null {
  const compact = input.replace(/[\s-]/g, "").toUpperCase();

  if (/^97[89]\d{10}$/.test(compact)) {
    return isbn13CheckDigit(compact.slice(0, 12)) === compact[12]
      ? compact
      : null;
  }

  if (/^\d{9}[\dX]$/.test(compact)) {
    if (isbn10CheckDigit(compact.slice(0, 9)) !== compact[9]) return null;
    const body = `978${compact.slice(0, 9)}`;
    return body + isbn13CheckDigit(body);
  }

  return null;
}

function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i);
  const digit = (11 - (sum % 11)) % 11;
  return digit === 10 ? "X" : String(digit);
}

/** 9784150102296 → 978-4150102296, the way a Japanese colophon prints it. */
export function formatIsbn(isbn13: string): string {
  return `${isbn13.slice(0, 3)}-${isbn13.slice(3)}`;
}
