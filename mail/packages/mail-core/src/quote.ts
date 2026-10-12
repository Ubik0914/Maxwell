// プレーンテキスト本文の引用部分を判別する（仕様2章3：引用・返信を判別しやすく表示）。

export type TextSegment = { kind: "text"; content: string } | { kind: "quote"; content: string };

/** 引用ブロック直前に置かれる「〜wrote:」「〜は書きました:」行 */
const ATTRIBUTION_RE = [
  /^On .+wrote:\s*$/i,
  /^.+(さんは|は)書きました\s*[:：]\s*$/,
  /^\d{4}年\d{1,2}月\d{1,2}日.*[:：]\s*$/,
  /^-{2,}\s*(Original Message|元のメッセージ)\s*-{2,}\s*$/i,
];

function isQuoteLine(line: string): boolean {
  return /^\s*>/.test(line);
}

function isAttribution(line: string): boolean {
  return ATTRIBUTION_RE.some((re) => re.test(line.trim()));
}

export function splitQuotedText(text: string): TextSegment[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const segments: TextSegment[] = [];
  const last = (): TextSegment | undefined => segments[segments.length - 1];

  const push = (kind: TextSegment["kind"], line: string) => {
    const cur = last();
    if (cur && cur.kind === kind) cur.content += "\n" + line;
    else segments.push({ kind, content: line });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isQuoteLine(line)) {
      push("quote", line);
      continue;
    }
    // 帰属行の直後（空行を挟んでもよい）に引用行が続く場合、帰属行も引用側に含める
    if (isAttribution(line)) {
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() === "") j++;
      if (j < lines.length && isQuoteLine(lines[j]!)) {
        push("quote", line);
        continue;
      }
      // 「Original Message」区切り以降はすべて引用とみなす
      if (/Original Message|元のメッセージ/i.test(line)) {
        push("quote", lines.slice(i).join("\n"));
        break;
      }
    }
    // 引用ブロック内の空行は、次も引用なら引用側に含める
    if (line.trim() === "" && last()?.kind === "quote" && i + 1 < lines.length && isQuoteLine(lines[i + 1]!)) {
      push("quote", line);
      continue;
    }
    push("text", line);
  }

  return segments
    .map((s) => ({ ...s, content: s.kind === "text" ? s.content.replace(/^\n+|\n+$/g, "") : s.content }))
    .filter((s) => s.content.trim().length > 0);
}

/** 引用を除いた本文だけを返す（MCPの要約用データ整形で使う） */
export function stripQuoted(text: string): string {
  return splitQuotedText(text)
    .filter((s) => s.kind === "text")
    .map((s) => s.content)
    .join("\n\n")
    .trim();
}

/** 返信本文に元メールを引用として付ける */
export function quoteForReply(original: string, attribution: string): string {
  const quoted = original
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => (l.length ? `> ${l}` : ">"))
    .join("\n");
  return `${attribution}\n${quoted}`;
}
