import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The guide, as files on disk.
 *
 * Markdown rather than JSX, because the guide is prose and prose in a
 * component is prose nobody wants to edit. The app already renders
 * Markdown for a task's description, so the docs cost a reader, not a
 * pipeline.
 *
 * Everything is read at build time — the routes are static, and nothing
 * here reads a cookie or a header — so this never runs on a request.
 */
const DOCS_DIR = join(process.cwd(), "src/content/docs");

/**
 * The number in front of the filename is the running order and nothing
 * else, so it comes off the slug. A guide has an order — you read it
 * front to back the first time — and a directory listing is the
 * simplest place to keep one that stays right when a page is inserted.
 */
const FILENAME = /^(\d+)-(.+)\.md$/;

export interface DocMeta {
  slug: string;
  title: string;
  /** The first paragraph, for the index and the page description. */
  summary: string;
}

export interface Doc extends DocMeta {
  body: string;
}

/**
 * Title and summary are read out of the prose rather than declared in
 * frontmatter: the file already opens with an `# H1` and a paragraph
 * saying what it is about, and a header block would be the same two
 * facts written twice, free to disagree with each other.
 */
function parse(slug: string, source: string): Doc {
  const lines = source.split("\n");
  const headingAt = lines.findIndex((line) => line.startsWith("# "));
  const title = headingAt === -1 ? slug : lines[headingAt].slice(2).trim();

  const rest = lines.slice(headingAt + 1);
  const start = rest.findIndex((line) => line.trim() !== "");
  const summaryLines: string[] = [];
  if (start !== -1) {
    for (const line of rest.slice(start)) {
      if (line.trim() === "") break;
      summaryLines.push(line.trim());
    }
  }

  return {
    slug,
    title,
    // Stripped of emphasis and links: this is shown as plain text on
    // the index and handed to <meta name="description">, neither of
    // which renders Markdown.
    summary: summaryLines
      .join(" ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]/g, ""),
    body: source,
  };
}

function read(): Doc[] {
  return readdirSync(DOCS_DIR)
    .filter((name) => FILENAME.test(name))
    .sort()
    .map((name) => {
      const slug = name.match(FILENAME)![2];
      return parse(slug, readFileSync(join(DOCS_DIR, name), "utf8"));
    });
}

export function listDocs(): DocMeta[] {
  return read().map(({ slug, title, summary }) => ({ slug, title, summary }));
}

export function getDoc(slug: string): Doc | undefined {
  return read().find((doc) => doc.slug === slug);
}

/**
 * What sits either side of a page, for the links at the bottom of one.
 * A guide read front to back should not send you back to the index
 * between every two pages.
 */
export function neighbours(slug: string): {
  previous?: DocMeta;
  next?: DocMeta;
} {
  const docs = listDocs();
  const at = docs.findIndex((doc) => doc.slug === slug);
  if (at === -1) return {};
  return { previous: docs[at - 1], next: docs[at + 1] };
}
