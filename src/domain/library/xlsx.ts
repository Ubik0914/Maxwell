/**
 * The first column of an Excel workbook's first sheet, as text.
 *
 * Why read .xlsx at all when there is CSV: Excel shows a 13-digit ISBN
 * as 9.78479E+12, and saving as CSV writes what is shown — the digits
 * are gone. The workbook itself keeps the number whole, so taking the
 * .xlsx as it is spares anyone from reformatting the column first.
 *
 * Only what that needs: the zip's directory, deflate (the browser's
 * own DecompressionStream), shared strings and the A cells. No styles,
 * no formulas — a formula cell's cached value is read like any other.
 */

interface ZipEntry {
  method: number;
  offset: number;
  size: number;
}

function readEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  // The end-of-central-directory record, searched for from the end
  // (a comment may follow it).
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error("not a zip");

  const entries = new Map<string, ZipEntry>();
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    // The data starts after the local header, whose own name and extra
    // field may differ in length from the central directory's.
    const offset =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    entries.set(name, { method, offset, size });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readText(
  bytes: Uint8Array,
  entries: Map<string, ZipEntry>,
  name: string,
): Promise<string | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  const data = bytes.slice(entry.offset, entry.offset + entry.size);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error("unsupported compression");
  const stream = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

function unescapeXml(text: string): string {
  return text.replace(
    /&(lt|gt|quot|apos|amp|#\d+|#x[\da-f]+);/gi,
    (_, entity: string) => {
      switch (entity) {
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
          return "'";
        case "amp":
          return "&";
      }
      return String.fromCodePoint(
        entity[1] === "x" || entity[1] === "X"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10),
      );
    },
  );
}

/** Every <t> run inside one string item, joined. */
function textOf(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => unescapeXml(match[1]))
    .join("");
}

/** The path of the workbook's first sheet. */
async function firstSheet(
  bytes: Uint8Array,
  entries: Map<string, ZipEntry>,
): Promise<string> {
  const fallback = "xl/worksheets/sheet1.xml";
  const workbook = await readText(bytes, entries, "xl/workbook.xml");
  const id = workbook?.match(/<sheet\s[^>]*r:id="([^"]+)"/)?.[1];
  const rels = await readText(bytes, entries, "xl/_rels/workbook.xml.rels");
  if (!id || !rels) return fallback;
  const target = [...rels.matchAll(/<Relationship\s[^>]*>/g)]
    .map((match) => match[0])
    .find((tag) => tag.includes(`Id="${id}"`))
    ?.match(/Target="([^"]+)"/)?.[1];
  if (!target) return fallback;
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

/** A number cell's value written out in full: 9.784791234567E12 → 9784…. */
function numberText(value: string): string {
  const number = Number(value);
  return Number.isSafeInteger(number) ? String(number) : value;
}

/** The text of column A, row by row, of the workbook's first sheet. */
export async function firstColumnOfXlsx(
  buffer: ArrayBuffer,
): Promise<string[]> {
  const bytes = new Uint8Array(buffer);
  const entries = readEntries(bytes);

  const shared = await readText(bytes, entries, "xl/sharedStrings.xml");
  const strings = shared
    ? [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
        textOf(match[1]),
      )
    : [];

  const sheet = await readText(
    bytes,
    entries,
    await firstSheet(bytes, entries),
  );
  if (!sheet) throw new Error("no sheet");

  const column: string[] = [];
  for (const cell of sheet.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attributes = cell[1];
    if (!/\br="A\d+"/.test(attributes)) continue;
    const body = cell[2] ?? "";
    const type = attributes.match(/\bt="([^"]+)"/)?.[1];
    const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
    if (type === "s") column.push(strings[Number(value)] ?? "");
    else if (type === "inlineStr") column.push(textOf(body));
    else if (value === undefined) column.push("");
    else if (type === "str" || type === "e" || type === "b")
      column.push(unescapeXml(value));
    else column.push(numberText(value));
  }
  return column;
}
