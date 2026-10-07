import type { ShelvedBook } from "../../../domain/library/filter";

jest.mock("../../../repositories/book.repository", () => ({
  DUPLICATE_ISBN: "23505",
  findBookByIsbn: jest.fn(),
  createBook: jest.fn(),
}));
jest.mock("../bibliography", () => ({
  fetchBookDetails: jest.fn(),
}));

import * as repository from "../../../repositories/book.repository";
import { fetchBookDetails } from "../bibliography";
import {
  CatalogueUnreachableError,
  shelveByIsbn,
} from "../shelve";

const supabase = {} as Parameters<typeof shelveByIsbn>[0];
const findBookByIsbn = repository.findBookByIsbn as jest.Mock;
const createBook = repository.createBook as jest.Mock;
const fetchDetails = fetchBookDetails as jest.Mock;

const ISBN = "9784151200533";
const book = { id: "b1", title: "一九八四年", isbn: ISBN } as ShelvedBook;

beforeEach(() => jest.resetAllMocks());

describe("shelveByIsbn", () => {
  it("leaves a book already on the shelf alone", async () => {
    findBookByIsbn.mockResolvedValue(book);
    expect(await shelveByIsbn(supabase, ISBN)).toEqual({
      status: "duplicate",
      book,
    });
    expect(fetchDetails).not.toHaveBeenCalled();
    expect(createBook).not.toHaveBeenCalled();
  });

  it("adds nothing for a number no catalogue knows", async () => {
    findBookByIsbn.mockResolvedValue(null);
    fetchDetails.mockResolvedValue(null);
    expect(await shelveByIsbn(supabase, ISBN)).toEqual({
      status: "not_found",
      isbn: ISBN,
    });
    expect(createBook).not.toHaveBeenCalled();
  });

  it("adds what the catalogue had, with the place and note given", async () => {
    findBookByIsbn.mockResolvedValue(null);
    fetchDetails.mockResolvedValue({
      title: "一九八四年",
      authors: "オーウェル",
    });
    createBook.mockResolvedValue(book);

    expect(
      await shelveByIsbn(supabase, ISBN, { location: "自宅", note: "再読" }),
    ).toEqual({ status: "added", book });
    expect(createBook).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        title: "一九八四年",
        authors: "オーウェル",
        isbn: ISBN,
        location: "自宅",
        note: "再読",
      }),
    );
  });

  it("says the catalogues were unreachable rather than adding a blank", async () => {
    findBookByIsbn.mockResolvedValue(null);
    fetchDetails.mockRejectedValue(new Error("timeout"));
    await expect(shelveByIsbn(supabase, ISBN)).rejects.toBeInstanceOf(
      CatalogueUnreachableError,
    );
  });

  it("treats losing a race to the same ISBN as a duplicate", async () => {
    findBookByIsbn.mockResolvedValueOnce(null).mockResolvedValueOnce(book);
    fetchDetails.mockResolvedValue({ title: "一九八四年" });
    createBook.mockRejectedValue({ code: "23505" });
    expect(await shelveByIsbn(supabase, ISBN)).toEqual({
      status: "duplicate",
      book,
    });
  });
});
