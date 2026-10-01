import type { ShelvedBook } from "../filter";
import { booksToCsv, decodeCsv, isbnsFromCsv, parseCsv } from "../csv";

describe("parseCsv", () => {
  it("reads quoted cells, doubled quotes and both line endings", () => {
    expect(parseCsv('a,"b,c"\r\n"say ""hi""",d\ne')).toEqual([
      ["a", "b,c"],
      ['say "hi"', "d"],
      ["e"],
    ]);
  });

  it("keeps a line break inside quotes", () => {
    expect(parseCsv('"one\ntwo",x\n')).toEqual([["one\ntwo", "x"]]);
  });
});

describe("isbnsFromCsv", () => {
  it("takes the numbers in the first column and skips everything else", () => {
    const text = [
      "isbn,title",
      "9784150102296,ソラリス",
      "",
      "メモ,9784151200533",
      "4-15-120053-3",
    ].join("\n");
    expect(isbnsFromCsv(text)).toEqual({
      isbns: ["9784150102296", "9784151200533"],
      invalid: [],
      rounded: 0,
      repeated: 0,
    });
  });

  it('accepts full-width digits, a BOM and Excel\'s ="…" cells', () => {
    expect(
      isbnsFromCsv('\uFEFF９７８４１５０１０２２９６\n="9784151200533"\n')
        .isbns,
    ).toEqual(["9784150102296", "9784151200533"]);
  });

  it("reports numbers that are not ISBNs, and counts repeats", () => {
    const result = isbnsFromCsv(
      "9784150102290\n9784150102296\n978-4150102296\n12345\n",
    );
    expect(result.isbns).toEqual(["9784150102296"]);
    expect(result.invalid).toEqual(["9784150102290", "12345"]);
    expect(result.repeated).toBe(1);
  });

  it("counts cells Excel already wrote as 9.78479E+12", () => {
    const result = isbnsFromCsv("9.78479E+12\n9784150102296\n");
    expect(result.rounded).toBe(1);
    expect(result.isbns).toEqual(["9784150102296"]);
  });
});

describe("booksToCsv", () => {
  const book: ShelvedBook = {
    id: "1",
    title: 'ソラリス, "新訳"',
    authors: "スタニスワフ・レム",
    publisher: null,
    published: "2015-04",
    price: 1300,
    isbn: "9784150102296",
    location: "=本棚",
    cover_url: null,
    ndc: "989",
    note: "一行目\n二行目",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("writes a header and quotes what needs quoting", () => {
    const csv = booksToCsv([book]);
    expect(csv.startsWith("\uFEFFisbn,title,")).toBe(true);
    const rows = parseCsv(csv.slice(1));
    expect(rows[1]).toEqual([
      "9784150102296",
      'ソラリス, "新訳"',
      "スタニスワフ・レム",
      "",
      "2015-04",
      "1300",
      "'=本棚",
      "989",
      "一行目\n二行目",
      "2026-01-01T00:00:00Z",
    ]);
  });

  it("reads back through the importer", () => {
    expect(isbnsFromCsv(booksToCsv([book])).isbns).toEqual(["9784150102296"]);
  });
});

describe("decodeCsv", () => {
  it("falls back to Shift_JIS when the bytes are not UTF-8", () => {
    // 本 in Shift_JIS
    expect(decodeCsv(new Uint8Array([0x96, 0x7b]).buffer)).toBe("本");
    expect(decodeCsv(new TextEncoder().encode("本").buffer)).toBe("本");
  });
});
