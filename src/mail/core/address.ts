import type { Address } from "./types";

/**
 * RFC 5322 のアドレスリストを分割・解析する（表示と返信宛先計算に十分な範囲）。
 * 引用符・コメント・山括弧内のカンマを区切りとして扱わない。
 */
export function parseAddressList(value: string | null | undefined): Address[] {
  if (!value) return [];
  const parts: string[] = [];
  let buf = "";
  let inQuote = false;
  let depthAngle = 0;
  let depthParen = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === "\\" && inQuote) {
      buf += ch + (value[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote) {
      if (ch === "<") depthAngle++;
      else if (ch === ">") depthAngle = Math.max(0, depthAngle - 1);
      else if (ch === "(") depthParen++;
      else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
      else if ((ch === "," || ch === ";") && depthAngle === 0 && depthParen === 0) {
        parts.push(buf);
        buf = "";
        continue;
      }
    }
    buf += ch;
  }
  parts.push(buf);
  return parts.map(parseAddress).filter((a): a is Address => a !== null);
}

export function parseAddress(raw: string): Address | null {
  const s = raw.trim();
  if (!s) return null;
  const angle = /^(.*)<([^<>]+)>\s*$/.exec(s);
  if (angle) {
    const email = angle[2]!.trim();
    const name = unquote(angle[1]!.trim());
    return name ? { name, email } : { email };
  }
  // "addr (Name)" 形式
  const comment = /^([^\s()]+@[^\s()]+)\s*\((.*)\)\s*$/.exec(s);
  if (comment) return { email: comment[1]!, name: comment[2]!.trim() || undefined } as Address;
  if (s.includes("@")) return { email: s };
  return null;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return s;
}

export function formatAddress(a: Address): string {
  if (!a.name) return a.email;
  const needsQuote = /[()<>@,;:\\".[\]]/.test(a.name);
  const name = needsQuote ? `"${a.name.replace(/(["\\])/g, "\\$1")}"` : a.name;
  return `${name} <${a.email}>`;
}

export function displayName(a: Address | null | undefined): string {
  if (!a) return "(不明な送信者)";
  return a.name?.trim() || a.email;
}

export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** 重複（大文字小文字無視）と除外対象を取り除く */
export function uniqueAddresses(list: Address[], exclude: string[] = []): Address[] {
  const seen = new Set(exclude.map((e) => e.toLowerCase()));
  const out: Address[] = [];
  for (const a of list) {
    const key = a.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
