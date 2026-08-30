import { parseCsv } from "@/domain/csv/parse";

const cells = (text: string) => parseCsv(text).map((row) => row.cells);

describe("parseCsv", () => {
  it("reads a plain table", () => {
    expect(cells("a,b\n1,2\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps empty cells rather than dropping them", () => {
    expect(cells("a,,c")).toEqual([["a", "", "c"]]);
    expect(cells("a,b,")).toEqual([["a", "b", ""]]);
  });

  it("keeps a comma that is inside quotes", () => {
    // The whole reason this is not text.split(","): a description is
    // prose, and prose has commas in it.
    expect(cells('title,notes\nShip it,"Monday, or Tuesday"')).toEqual([
      ["title", "notes"],
      ["Ship it", "Monday, or Tuesday"],
    ]);
  });

  it('reads "" inside quotes as one quote', () => {
    expect(cells('a,"He said ""no"""')).toEqual([["a", 'He said "no"']]);
  });

  it("keeps a newline that is inside quotes, as one row", () => {
    // What a spreadsheet writes when somebody pressed alt-enter.
    const rows = parseCsv('title,notes\nShip it,"first\nsecond"\nNext,');
    expect(rows.map((row) => row.cells)).toEqual([
      ["title", "notes"],
      ["Ship it", "first\nsecond"],
      ["Next", ""],
    ]);
    // And the line numbers still count physical lines, so a problem is
    // reported where the person can actually see it.
    expect(rows.map((row) => row.line)).toEqual([1, 2, 4]);
  });

  it.each([
    ["CRLF", "a,b\r\n1,2"],
    ["LF", "a,b\n1,2"],
    ["CR", "a,b\r1,2"],
  ])("handles %s line endings", (_name, text) => {
    expect(cells(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops a byte order mark rather than gluing it to the first header", () => {
    expect(cells("﻿title,notes\na,b")[0][0]).toBe("title");
  });

  it("ignores blank lines, including a trailing newline", () => {
    expect(cells("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });

  it("does not treat a quote in the middle of a field as quoting", () => {
    // 5" is a measurement, not the start of a quoted section.
    expect(cells('a,5" pipe,b')).toEqual([["a", '5" pipe', "b"]]);
  });
});
