import { isbnsFromCells } from "../csv";
import { firstColumnOfXlsx } from "../xlsx";

// A small workbook built with Python's zipfile: column A holds a shared
// string header, a number in exponent form, an inline string, an empty
// cell and a formula's cached text; column B has decoys.
const WORKBOOK =
  "UEsDBBQAAAAIAD0OQV1yoBqlSQAAAF0AAAAPAAAAeGwvd29ya2Jvb2sueG1ssynPL8pOys/PVqjIzckrtiqyVSpSsrMpzkhNLSmG0gp5ibmptkrP5qxRUgALeKbYKhkqKRRZZQIZRZ4p5kr6djb6MD36MCPtAFBLAwQUAAAACAA9DkFdbSnRWEwAAACDAAAAGgAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzswlKzUksyczPK87ILCi2s0HmKnim2CoVeaYYKimEJBalp5bYKhWXVOakFutV5OYo6WNXbI5QXJ5flF2ckZpaUqyflJ+fDdemj2onAFBLAwQUAAAACAA9DkFdfBOOiUAAAABaAAAAFAAAAHhsL3NoYXJlZFN0cmluZ3MueG1ssykuLrGzKc60symxyyxOyrPRB3L1QXwQLgIJP27a+7h55ePmVY+bdkKki6AyCmqJuQXWCk92T4OLg7XqgwwFAFBLAwQUAAAACAA9DkFdbapANbMAAACUAQAAFwAAAHhsL3dvcmtzaGVldHMvYm9va3MueG1shZHvCoIwFMVfRfZ93f3NhOsgqSfoCUSUpFDYhr5+c9USg/q0u5273865w3m0N3dtW28wLqfa1wbtOGe2JJwYbJbiyEnmS+LCfjIMYTIIzUur1hpPGgRGAokEErGt2OUHxTXjTIhif+ZigxT/kTIhZWzuh3s/tBdvw3nvDHpT5AeqKNeUC8a0pBIhpIRF/KKpRFMkc0tyeHtRv1zodE8/Lcf3O1MphC4mXQfdMGA1cfh8xANQSwECFAMUAAAACAA9DkFdcqAapUkAAABdAAAADwAAAAAAAAAAAAAAgAEAAAAAeGwvd29ya2Jvb2sueG1sUEsBAhQDFAAAAAgAPQ5BXW0p0VhMAAAAgwAAABoAAAAAAAAAAAAAAIABdgAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQDFAAAAAgAPQ5BXXwTjolAAAAAWgAAABQAAAAAAAAAAAAAAIAB+gAAAHhsL3NoYXJlZFN0cmluZ3MueG1sUEsBAhQDFAAAAAgAPQ5BXW2qQDWzAAAAlAEAABcAAAAAAAAAAAAAAIABbAEAAHhsL3dvcmtzaGVldHMvYm9va3MueG1sUEsFBgAAAAAEAAQADAEAAFQCAAAAAA==";

function bytes(): ArrayBuffer {
  return Uint8Array.from(Buffer.from(WORKBOOK, "base64")).buffer;
}

describe("firstColumnOfXlsx", () => {
  it("reads column A of the first sheet, numbers written out in full", async () => {
    expect(await firstColumnOfXlsx(bytes())).toEqual([
      "isbn",
      "9784150102296",
      "978-4-15-120053-3",
      "",
      "9784150102296",
    ]);
  });

  it("feeds the same ISBN reading as a CSV", async () => {
    expect(isbnsFromCells(await firstColumnOfXlsx(bytes()))).toEqual({
      isbns: ["9784150102296", "9784151200533"],
      invalid: [],
      rounded: 0,
      repeated: 1,
    });
  });

  it("rejects a file that is not a zip", async () => {
    await expect(
      firstColumnOfXlsx(new TextEncoder().encode("isbn\n978").buffer),
    ).rejects.toThrow();
  });
});
