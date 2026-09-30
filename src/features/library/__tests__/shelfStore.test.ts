import type { ShelvedBook } from "@/domain/library/filter";

function book(id: string): ShelvedBook {
  return {
    id,
    title: id,
    authors: null,
    publisher: null,
    published: null,
    price: null,
    isbn: null,
    location: null,
    cover_url: null,
    note: null,
    created_at: "2026-09-30T00:00:00Z",
  };
}

function answer(books: ShelvedBook[]) {
  return {
    ok: true,
    json: async () => ({ data: { books } }),
  } as Response;
}

describe("shelfStore", () => {
  let store: typeof import("../shelfStore");

  beforeEach(async () => {
    jest.resetModules();
    store = await import("../shelfStore");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("GETs the shelf and hands it to listeners", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(answer([book("a")]));
    const seen: string[][] = [];
    store.subscribeShelf((books) => seen.push(books.map((b) => b.id)));

    await store.refreshShelf();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/books?limit=5000",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(seen).toEqual([["a"]]);
    expect(store.knownShelf()?.map((b) => b.id)).toEqual(["a"]);
  });

  it("keeps only the last GET asked for when answers cross", async () => {
    let first!: (response: Response) => void;
    jest
      .spyOn(global, "fetch")
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (first = resolve)),
      )
      .mockResolvedValueOnce(answer([book("new"), book("old")]));
    const seen: string[][] = [];
    store.subscribeShelf((books) => seen.push(books.map((b) => b.id)));

    const early = store.refreshShelf();
    await store.refreshShelf();
    first(answer([book("old")]));
    await early;

    expect(seen).toEqual([["new", "old"]]);
    expect(store.knownShelf()?.map((b) => b.id)).toEqual(["new", "old"]);
  });

  it("keeps what it had when the GET fails", async () => {
    store.rememberShelf([book("kept")]);
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));

    await store.refreshShelf();

    expect(store.knownShelf()?.map((b) => b.id)).toEqual(["kept"]);
  });
});
