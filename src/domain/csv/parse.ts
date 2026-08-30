/**
 * A CSV reader, to RFC 4180.
 *
 * Small enough to own rather than depend on. What actually has to be
 * right is the quoting: a task description is prose, and prose contains
 * commas, quotation marks and — when it came out of a spreadsheet cell
 * somebody pressed alt-enter in — newlines. A split on "," gets all
 * three wrong, and gets them wrong quietly, which is the worst way for
 * an importer to be wrong.
 *
 * So: a field wrapped in double quotes may contain commas, CRLF and
 * doubled quotes ("" for one "). Anything outside quotes ends at the
 * next comma or line break. \r\n and \n are both line breaks; a lone
 * \r is one too, because a file last saved by a classic Mac is still a
 * file somebody will drop on this.
 *
 * Lines are returned with their 1-based number in the file, so a
 * problem can be reported where the person can see it — which is the
 * whole reason this returns rows rather than objects.
 */

export interface CsvRow {
  /** 1-based, counting physical lines, so a quoted newline advances it. */
  line: number;
  cells: string[];
}

export function parseCsv(text: string): CsvRow[] {
  // A byte order mark is not a character of the first header name, but
  // it will happily become part of one and leave "title" not matching
  // "title".
  const input = text.replace(/^﻿/, "");

  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let started = false;

  const endField = () => {
    cells.push(field);
    field = "";
    started = true;
  };

  const endRow = () => {
    endField();
    rows.push({ line: rowLine, cells });
    cells = [];
    started = false;
    rowLine = line;
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        // "" inside a quoted field is one literal quote; a single "
        // ends the field.
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
        continue;
      }
      if (char === "\n") line += 1;
      field += char;
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
      started = true;
      continue;
    }

    if (char === ",") {
      endField();
      continue;
    }

    if (char === "\r" || char === "\n") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      line += 1;
      // A blank line is skipped rather than returned as a row of one
      // empty cell — trailing newlines are how files end, not data.
      if (started || field !== "" || cells.length > 0) endRow();
      else rowLine = line;
      continue;
    }

    field += char;
    started = true;
  }

  if (started || field !== "" || cells.length > 0) endRow();

  return rows;
}
