import { ndcClassName, ndcGenre } from "../ndc";

describe("ndcGenre", () => {
  it("reads the class and the division", () => {
    expect(ndcGenre("933.7")).toEqual({
      classCode: "9",
      className: "文学",
      name: "英米文学",
    });
    expect(ndcGenre("336")).toEqual({
      classCode: "3",
      className: "社会科学",
      name: "経済",
    });
  });

  it("names comics for what they are", () => {
    expect(ndcGenre("726.1")?.name).toBe("マンガ・絵本");
  });

  it("folds full-width digits and ignores what is not an NDC", () => {
    expect(ndcGenre("９１３．６")?.name).toBe("日本文学");
    expect(ndcGenre(null)).toBeNull();
    expect(ndcGenre("")).toBeNull();
    expect(ndcGenre("K12")).toBeNull();
  });
});

describe("ndcClassName", () => {
  it("names a class digit", () => {
    expect(ndcClassName("4")).toBe("自然科学");
    expect(ndcClassName("x")).toBeNull();
  });
});
