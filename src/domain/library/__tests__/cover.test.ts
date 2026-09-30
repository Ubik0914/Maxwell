import { coverCandidates } from "../cover";
import { toIsbn10 } from "../isbn";

describe("toIsbn10", () => {
  it("converts a 978 ISBN", () => {
    expect(toIsbn10("9784151200533")).toBe("4151200533");
    expect(toIsbn10("9780804429573")).toBe("080442957X");
  });

  it("has no answer for 979, which has no 10-digit form", () => {
    expect(toIsbn10("9791234567896")).toBeNull();
  });
});

describe("coverCandidates", () => {
  it("tries 版元ドットコム first, then Amazon by ISBN-10", () => {
    expect(coverCandidates("9784309467887")).toEqual([
      "https://www.hanmoto.com/bd/img/9784309467887.jpg",
      "https://images-na.ssl-images-amazon.com/images/P/4309467881.09.LZZZZZZZ.jpg",
    ]);
  });

  it("skips Amazon for a 979 ISBN", () => {
    expect(coverCandidates("9791234567896")).toHaveLength(1);
  });
});
