import { isbnFromBarcode, ScanSession } from "../scan";

describe("isbnFromBarcode", () => {
  it("reads the ISBN barcode on a back cover", () => {
    expect(isbnFromBarcode("9784151200533")).toBe("9784151200533");
  });

  it("ignores the 書籍JANコード printed underneath it", () => {
    expect(isbnFromBarcode("1920097008604")).toBeNull();
  });

  it("ignores any other product barcode", () => {
    expect(isbnFromBarcode("4901234567894")).toBeNull();
  });

  it("refuses a book-land code whose check digit is wrong", () => {
    expect(isbnFromBarcode("9784151200534")).toBeNull();
  });

  it("takes what a person or a keyboard-wedge scanner types", () => {
    expect(isbnFromBarcode(" 4-15-120053-3 ")).toBe("9784151200533");
    expect(isbnFromBarcode("978-4-15-120053-3")).toBe("9784151200533");
  });
});

describe("ScanSession", () => {
  it("admits an ISBN once", () => {
    const session = new ScanSession();
    expect(session.admit("9784151200533")).toBe(true);
    expect(session.admit("9784151200533")).toBe(false);
    expect(session.admit("9784150102296")).toBe(true);
  });

  it("admits it again once forgotten", () => {
    const session = new ScanSession();
    session.admit("9784151200533");
    session.forget("9784151200533");
    expect(session.admit("9784151200533")).toBe(true);
  });
});
