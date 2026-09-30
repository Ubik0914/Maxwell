import {
  filterBooks,
  foldForSearch,
  genres,
  libraryStats,
  shelfOverview,
  shelves,
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
    cover_url: null,
    ndc: null,
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
    expect(libraryStats(shelf)).toEqual({ total: 3, value: 1960 });
  });
});

describe("filterBooks by location", () => {
  it("keeps one shelf, or the books with none", () => {
    expect(
      filterBooks(shelf, { query: "", location: "会社" }).map((b) => b.title),
    ).toEqual(["ちいかわ お友だちとのつき合いかた"]);
    expect(filterBooks(shelf, { query: "", location: null })).toHaveLength(2);
    expect(filterBooks(shelf, { query: "" })).toHaveLength(3);
  });

  it("combines with the search", () => {
    expect(
      filterBooks(shelf, { query: "orwell", location: "会社" }),
    ).toHaveLength(0);
  });

  it("treats a blank location as none", () => {
    const blank = [book({ title: "空白", location: "  " })];
    expect(filterBooks(blank, { query: "", location: null })).toHaveLength(1);
  });
});

describe("shelves", () => {
  it("lists the fullest first and the unplaced last", () => {
    const books = [
      ...shelf,
      book({ title: "a", location: "本棚" }),
      book({ title: "b", location: "本棚" }),
      book({ title: "c", location: "本棚" }),
    ];
    expect(shelves(books)).toEqual([
      { name: "本棚", count: 3 },
      { name: "会社", count: 1 },
      { name: null, count: 2 },
    ]);
  });
});

describe("shelfOverview", () => {
  it("counts value, distinct authors and the last thirty days", () => {
    expect(
      shelfOverview(
        [...shelf, book({ title: "再", authors: " ナガノ " })],
        new Date("2026-10-02T00:00:00Z"),
      ),
    ).toEqual({ total: 4, value: 1960, authors: 3, recent: 2 });
  });
});

describe("genres", () => {
  const books = [
    book({ title: "a", ndc: "933.7" }),
    book({ title: "b", ndc: "913.6" }),
    book({ title: "c", ndc: "336" }),
    book({ title: "d" }),
  ];

  it("counts each NDC class in order, the unclassified last", () => {
    expect(genres(books)).toEqual([
      { code: "3", count: 1 },
      { code: "9", count: 2 },
      { code: null, count: 1 },
    ]);
  });

  it("filters by class, or by having none", () => {
    expect(
      filterBooks(books, { query: "", genre: "9" }).map((b) => b.title),
    ).toEqual(["a", "b"]);
    expect(filterBooks(books, { query: "", genre: null })).toHaveLength(1);
  });

  it("finds books by their genre's name", () => {
    expect(
      filterBooks(books, { query: "英米文学" }).map((b) => b.title),
    ).toEqual(["a"]);
  });
});
