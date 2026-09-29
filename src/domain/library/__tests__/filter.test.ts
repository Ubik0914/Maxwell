import {
  filterBooks,
  foldForSearch,
  libraryStats,
  sortBooks,
  type ShelvedBook,
} from "../filter";

function book(overrides: Partial<ShelvedBook>): ShelvedBook {
  return {
    id: overrides.title ?? "id",
    title: "Untitled",
    authors: null,
    publisher: null,
    published: null,
    price: null,
    isbn: null,
    location: null,
    lent_to: null,
    note: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

const shelf = [
  book({
    title: "一九八四年",
    authors: "Orwell, George / 高橋和久",
    publisher: "早川書房",
    published: "2009-07",
    price: 860,
    isbn: "9784151200533",
    created_at: "2026-09-02T00:00:00Z",
  }),
  book({
    title: "アンドロイドは電気羊の夢を見るか?",
    authors: "Dick, Philip K.",
    publisher: "早川書房",
    published: "2011-06",
    lent_to: "田中",
    created_at: "2026-09-03T00:00:00Z",
  }),
  book({
    title: "ちいかわ お友だちとのつき合いかた",
    authors: "ナガノ",
    publisher: "KADOKAWA",
    price: 1100,
    location: "会社",
  }),
];

describe("foldForSearch", () => {
  it("folds width, case and katakana", () => {
    expect(foldForSearch("ＫＡＤＯＫＡＷＡ")).toBe("kadokawa");
    expect(foldForSearch("アンドロイド")).toBe("あんどろいど");
    expect(foldForSearch("978-4151200533")).toBe("9784151200533");
  });
});

describe("filterBooks", () => {
  it("returns everything for an empty query", () => {
    expect(filterBooks(shelf, { query: " " })).toHaveLength(3);
  });

  it("needs every word to match, anywhere", () => {
    const found = filterBooks(shelf, { query: "orwell 早川" });
    expect(found.map((b) => b.title)).toEqual(["一九八四年"]);
  });

  it("finds katakana typed as hiragana", () => {
    const found = filterBooks(shelf, { query: "あんどろいど" });
    expect(found).toHaveLength(1);
  });

  it("finds by ISBN with hyphens", () => {
    const found = filterBooks(shelf, {
      query: "978-4151200533",
    });
    expect(found.map((b) => b.title)).toEqual(["一九八四年"]);
  });

  it("narrows to the books out on loan", () => {
    expect(
      filterBooks(shelf, { query: "", lentOnly: true }).map((b) => b.lent_to),
    ).toEqual(["田中"]);
  });
});

describe("sortBooks", () => {
  it("puts the newest first by default", () => {
    expect(sortBooks(shelf, "recent")[0].title).toBe(
      "アンドロイドは電気羊の夢を見るか?",
    );
  });

  it("sends books with no date to the end", () => {
    const sorted = sortBooks(shelf, "published").map((b) => b.published);
    expect(sorted).toEqual(["2011-06", "2009-07", null]);
  });

  it("does not reorder the array it was given", () => {
    const before = shelf.map((b) => b.id);
    sortBooks(shelf, "title");
    expect(shelf.map((b) => b.id)).toEqual(before);
  });
});

describe("libraryStats", () => {
  it("counts the shelf", () => {
    expect(libraryStats(shelf)).toEqual({ total: 3, lent: 1, value: 1960 });
  });
});
