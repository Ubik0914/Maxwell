import { formatAuthors, formatPubdate, parseOpenBdRecord } from "../openbd";

describe("formatPubdate", () => {
  it("keeps the year and month, whatever the shape", () => {
    expect(formatPubdate("20090725")).toBe("2009-07");
    expect(formatPubdate("200907")).toBe("2009-07");
    expect(formatPubdate("2009-07")).toBe("2009-07");
    expect(formatPubdate("2009")).toBe("2009");
  });

  it("gives up on nothing", () => {
    expect(formatPubdate("")).toBeNull();
    expect(formatPubdate(undefined)).toBeNull();
    expect(formatPubdate("c.")).toBeNull();
  });
});

describe("formatAuthors", () => {
  it("drops roles and life dates", () => {
    expect(formatAuthors("Orwell,George,1903-1950／著 高橋和久／訳")).toBe(
      "Orwell, George / 高橋和久",
    );
  });

  it("leaves a plain name alone", () => {
    expect(formatAuthors("ナガノ")).toBe("ナガノ");
  });

  it("returns null for nothing", () => {
    expect(formatAuthors("   ")).toBeNull();
    expect(formatAuthors(null)).toBeNull();
  });
});

describe("parseOpenBdRecord", () => {
  const record = {
    summary: {
      isbn: "9784151200533",
      title: "一九八四年",
      volume: "",
      publisher: "早川書房",
      pubdate: "20090725",
      author: "Orwell,George,1903-1950／著 高橋和久／訳",
    },
    onix: {
      ProductSupply: {
        SupplyDetail: { Price: [{ PriceType: "03", PriceAmount: "860" }] },
      },
    },
  };

  it("reads the summary and the price", () => {
    expect(parseOpenBdRecord(record)).toEqual({
      title: "一九八四年",
      authors: "Orwell, George / 高橋和久",
      publisher: "早川書房",
      published: "2009-07",
      price: 860,
    });
  });

  it("puts the volume after the title", () => {
    const withVolume = {
      ...record,
      summary: { ...record.summary, volume: "上" },
    };
    expect(parseOpenBdRecord(withVolume)?.title).toBe("一九八四年 上");
  });

  it("copes with a record that has no price", () => {
    expect(parseOpenBdRecord({ summary: record.summary })?.price).toBeNull();
  });

  it("is null for an ISBN openBD does not know", () => {
    expect(parseOpenBdRecord(null)).toBeNull();
    expect(parseOpenBdRecord({ summary: { title: "" } })).toBeNull();
  });
});
