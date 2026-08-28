import {
  appendImage,
  extensionFor,
  imageMarkdown,
  rejectImage,
  taskImageUrl,
} from "@/features/attachments/task-images";

function file(name: string, type: string, size: number): File {
  // jsdom's File reports the size of what it was given, so the bytes are
  // real rather than stubbed — a 10MB string would just be slow.
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("rejectImage", () => {
  it("accepts the formats the bucket accepts", () => {
    for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
      expect(rejectImage(file("shot." + type, type, 1000))).toBeNull();
    }
  });

  it("refuses what isn't an image", () => {
    expect(rejectImage(file("notes.pdf", "application/pdf", 1000))).toMatch(
      /isn't an image/,
    );
  });

  it("refuses SVG, which is a document that can run", () => {
    expect(rejectImage(file("logo.svg", "image/svg+xml", 100))).toMatch(
      /isn't an image/,
    );
  });

  it("refuses anything over 10 MB, before the upload rather than after", () => {
    expect(rejectImage(file("huge.png", "image/png", 10 * 1024 * 1024 + 1)))
      .toMatch(/larger than 10 MB/);
    expect(
      rejectImage(file("just-fits.png", "image/png", 10 * 1024 * 1024)),
    ).toBeNull();
  });

  it("says something usable when the file has no name", () => {
    expect(rejectImage(file("", "application/zip", 10))).toMatch(
      /^That file/,
    );
  });
});

describe("extensionFor", () => {
  it("names the file after what it actually is", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
  });

  it("falls back rather than inventing an extension", () => {
    expect(extensionFor("application/octet-stream")).toBe("bin");
  });
});

describe("taskImageUrl", () => {
  it("points at the app, not at storage", () => {
    expect(taskImageUrl("story-1/abc.png")).toBe(
      "/api/v1/attachments/story-1/abc.png",
    );
  });
});

describe("imageMarkdown", () => {
  it("uses the file's own name as the alt text", () => {
    expect(imageMarkdown("Design review.png", "/u")).toBe(
      "![Design review](/u)",
    );
  });

  it("still says something when the name is only an extension", () => {
    expect(imageMarkdown(".png", "/u")).toBe("![image](/u)");
  });
});

describe("appendImage", () => {
  it("is the whole description when there was none", () => {
    expect(appendImage("", "![a](/u)")).toBe("![a](/u)");
    expect(appendImage("   \n", "![a](/u)")).toBe("![a](/u)");
  });

  it("leaves a blank line, or Markdown folds it into the paragraph above", () => {
    expect(appendImage("Some notes.", "![a](/u)")).toBe(
      "Some notes.\n\n![a](/u)",
    );
  });

  it("does not stack blank lines when the description already ends in one", () => {
    expect(appendImage("Some notes.\n\n", "![a](/u)")).toBe(
      "Some notes.\n\n![a](/u)",
    );
  });
});
