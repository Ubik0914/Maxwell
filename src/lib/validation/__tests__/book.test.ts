import {
  bookAddByIsbnSchema,
  bookFieldsSchema,
  bookMoveSchema,
  bookPatchSchema,
} from "../book";

describe("bookPatchSchema", () => {
  it("takes any of a book's fields", () => {
    expect(
      bookPatchSchema.safeParse({ note: "x", location: null }).success,
    ).toBe(true);
  });

  it("refuses a key a book does not have", () => {
    expect(bookPatchSchema.safeParse({ owner_id: "someone" }).success).toBe(
      false,
    );
  });

  it("refuses an empty change", () => {
    expect(bookPatchSchema.safeParse({}).success).toBe(false);
  });

  it("leaves the values to bookFieldsSchema once merged", () => {
    const book = { title: "一九八四年", price: 900, note: "前のメモ" };
    const patch = bookPatchSchema.parse({ note: "", price: -1 });
    const merged = bookFieldsSchema.safeParse({ ...book, ...patch });
    expect(merged.success).toBe(false);

    const fixed = bookFieldsSchema.parse({
      ...book,
      ...bookPatchSchema.parse({ note: "" }),
    });
    expect(fixed).toMatchObject({
      title: "一九八四年",
      price: 900,
      note: null,
    });
  });
});

describe("bookAddByIsbnSchema", () => {
  it("normalises the ISBN", () => {
    expect(
      bookAddByIsbnSchema.parse({ isbn: "4-15-120053-3", location: "自宅" }),
    ).toEqual({ isbn: "9784151200533", location: "自宅" });
  });

  it("refuses fields a lookup would fill in", () => {
    expect(
      bookAddByIsbnSchema.safeParse({ isbn: "9784151200533", price: 1 })
        .success,
    ).toBe(false);
  });
});

describe("bookMoveSchema", () => {
  const id = "00000000-0000-4000-8000-000000000001";

  it("takes ids and a place, or null for none", () => {
    expect(
      bookMoveSchema.safeParse({ bookIds: [id], location: null }).success,
    ).toBe(true);
  });

  it("needs at least one id, and real ones", () => {
    expect(
      bookMoveSchema.safeParse({ bookIds: [], location: "x" }).success,
    ).toBe(false);
    expect(
      bookMoveSchema.safeParse({ bookIds: ["nope"], location: "x" }).success,
    ).toBe(false);
  });
});
