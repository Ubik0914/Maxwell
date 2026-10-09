import { amazonSearchUrl, googleSearchUrl } from "../search";

describe("googleSearchUrl", () => {
  it("searches for the title and the first author", () => {
    const url = new URL(
      googleSearchUrl({
        title: "一九八四年",
        authors: "Orwell, George / 高橋和久",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://www.google.com/search");
    expect(url.searchParams.get("q")).toBe("一九八四年 Orwell, George");
  });

  it("searches for the title alone when there is no author", () => {
    const url = new URL(googleSearchUrl({ title: " 蔵書 ", authors: null }));
    expect(url.searchParams.get("q")).toBe("蔵書");
  });
});

describe("amazonSearchUrl", () => {
  it("searches books on amazon.co.jp for the ISBN", () => {
    const url = new URL(
      amazonSearchUrl({
        title: "一九八四年",
        authors: "Orwell, George / 高橋和久",
        isbn: "9784151200533",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://www.amazon.co.jp/s");
    expect(url.searchParams.get("k")).toBe("9784151200533");
    expect(url.searchParams.get("i")).toBe("stripbooks");
  });

  it("searches for the title and the first author when there is no ISBN", () => {
    const url = new URL(
      amazonSearchUrl({
        title: "一九八四年",
        authors: "Orwell, George / 高橋和久",
        isbn: null,
      }),
    );
    expect(url.searchParams.get("k")).toBe("一九八四年 Orwell, George");
  });
});
