import {
  mergeDetails,
  parseIssued,
  parseNdlOpenSearch,
  parsePrice,
} from "../ndl";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcndl="http://ndl.go.jp/dcndl/terms/" xmlns:dcterms="http://purl.org/dc/terms/" version="2.0">
<channel>
<title>アンドロイドは電気羊の夢を見るか? - 国立国会図書館サーチ OpenSearch</title>
<item>
<title>アンドロイドは電気羊の夢を見るか?</title>
<link>https://ndlsearch.ndl.go.jp/books/R100000002-I000011199590</link>
<dc:title>アンドロイドは電気羊の夢を見るか?</dc:title>
<dc:creator>フィリップ・K.ディック 著</dc:creator>
<dc:creator>浅倉久志 訳</dc:creator>
<dc:publisher>早川書房</dc:publisher>
<dcterms:issued xsi:type="dcterms:W3CDTF">2011.6</dcterms:issued>
<dc:identifier xsi:type="dcndl:ISBN">978-4-15-010229-6</dc:identifier>
</item>
<item>
<title>アンドロイドは電気羊の夢を見るか?</title>
<dcndl:price>1,080円</dcndl:price>
</item>
</channel>
</rss>`;

describe("parseNdlOpenSearch", () => {
  it("reads the first record, and the first price among them", () => {
    expect(parseNdlOpenSearch(FEED)).toEqual({
      title: "アンドロイドは電気羊の夢を見るか?",
      authors: "フィリップ・K.ディック / 浅倉久志",
      publisher: "早川書房",
      published: "2011-06",
      price: 1080,
      cover_url: null,
    });
  });

  it("decodes entities in titles", () => {
    const xml = "<item><dc:title>A &amp; B &#x2013; C</dc:title></item>";
    expect(parseNdlOpenSearch(xml)?.title).toBe("A & B – C");
  });

  it("is null for a feed with no records", () => {
    expect(parseNdlOpenSearch("<rss><channel></channel></rss>")).toBeNull();
  });
});

describe("parsePrice", () => {
  it.each([
    ["760円", 760],
    ["1,500円+税", 1500],
    ["本体2400円", 2400],
    ["１２００円", 1200],
  ])("reads %s as %d yen", (raw, yen) => {
    expect(parsePrice(raw)).toBe(yen);
  });

  it("ignores prices in other currencies", () => {
    expect(parsePrice("$12.99")).toBeNull();
    expect(parsePrice("12ドル")).toBeNull();
  });

  it("is null for nothing", () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice("非売品")).toBeNull();
  });
});

describe("parseIssued", () => {
  it("keeps year and month in the shape openBD's dates use", () => {
    expect(parseIssued("2011.6")).toBe("2011-06");
    expect(parseIssued("2019-04")).toBe("2019-04");
    expect(parseIssued("2009")).toBe("2009");
    expect(parseIssued("")).toBeNull();
  });
});

describe("mergeDetails", () => {
  const openbd = {
    title: "アンドロイドは電気羊の夢を見るか?",
    authors: "Dick, Philip K.",
    publisher: "早川書房",
    published: "2011-06",
    price: null,
    cover_url: null,
  };
  const ndl = { ...openbd, authors: "ディック", price: 1080 };

  it("keeps openBD's fields and fills its gaps from the NDL", () => {
    expect(mergeDetails(openbd, ndl)).toEqual({ ...openbd, price: 1080 });
  });

  it("takes whichever one exists", () => {
    expect(mergeDetails(null, ndl)).toBe(ndl);
    expect(mergeDetails(openbd, null)).toBe(openbd);
    expect(mergeDetails(null, null)).toBeNull();
  });
});
