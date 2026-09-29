import { formatIsbn, normalizeIsbn } from "../isbn";

describe("normalizeIsbn", () => {
  it("keeps a valid ISBN-13, whatever it was punctuated with", () => {
    expect(normalizeIsbn("9784150102296")).toBe("9784150102296");
    expect(normalizeIsbn("978-4-15-010229-6")).toBe("9784150102296");
    expect(normalizeIsbn(" 978 4151200533 ")).toBe("9784151200533");
  });

  it("converts an ISBN-10 to the 13-digit form", () => {
    // 一九八四年 (ハヤカワepi文庫), printed both ways
    expect(normalizeIsbn("4151200533")).toBe("9784151200533");
    expect(normalizeIsbn("4-15-120053-3")).toBe("9784151200533");
    expect(normalizeIsbn("0-306-40615-2")).toBe("9780306406157");
  });

  it("accepts a lowercase x as the ISBN-10 check digit", () => {
    expect(normalizeIsbn("080442957x")).toBe("9780804429573");
  });

  it("refuses a number whose check digit is wrong", () => {
    expect(normalizeIsbn("9784150102297")).toBeNull();
    expect(normalizeIsbn("4151200534")).toBeNull();
  });

  it("refuses what is not an ISBN at all", () => {
    expect(normalizeIsbn("")).toBeNull();
    expect(normalizeIsbn("12345")).toBeNull();
    expect(normalizeIsbn("1234567890123")).toBeNull();
  });
});

describe("formatIsbn", () => {
  it("splits the prefix off the way colophons print it", () => {
    expect(formatIsbn("9784150102296")).toBe("978-4150102296");
  });
});
