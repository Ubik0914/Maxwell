// 受信HTMLのサニタイズ（仕様5章）。スクリプト等の危険要素を除去し、リモート画像を既定でブロックする。
// 表示側でも sandbox iframe + CSP をかけ、二重に防御する。
import sanitizeHtml from "sanitize-html";

const REMOTE_URL = /^\s*(https?:)?\/\//i;
const CSS_URL = /url\s*\(/i;

export interface SanitizeResult {
  html: string;
  remoteImagesBlocked: boolean;
}

export function sanitizeEmailHtml(input: string, opts: { allowRemoteImages: boolean }): SanitizeResult {
  let blocked = false;

  const html = sanitizeHtml(input, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "font",
      "center",
      "span",
      "div",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "colgroup",
      "col",
      "hr",
      "br",
    ],
    disallowedTagsMode: "discard",
    allowedAttributes: {
      "*": ["style", "align", "valign", "width", "height", "bgcolor", "color", "dir", "lang", "title", "class"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "data-blocked-src"],
      font: ["face", "size", "color"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      table: ["border", "cellpadding", "cellspacing"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        if (!opts.allowRemoteImages && REMOTE_URL.test(src)) {
          blocked = true;
          const { src: _src, ...rest } = attribs;
          return { tagName, attribs: { ...rest, alt: attribs.alt ?? "", "data-blocked-src": "1" } };
        }
        if (src.startsWith("cid:")) {
          // インライン添付は MVP では表示しない
          const { src: _src, ...rest } = attribs;
          return { tagName, attribs: rest };
        }
        return { tagName, attribs };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src && !frame.attribs["data-blocked-src"],
  });

  // style属性内の url() は追跡ピクセルになり得るため、ブロック時は除去する
  const cleaned = opts.allowRemoteImages
    ? html
    : html.replace(/style="([^"]*)"/gi, (m, style: string) => {
        if (!CSS_URL.test(style)) return m;
        blocked = true;
        return `style="${style.replace(/[a-z-]*\s*:\s*[^;]*url\s*\([^)]*\)[^;]*;?/gi, "")}"`;
      });

  return { html: cleaned, remoteImagesBlocked: blocked };
}

/** HTMLからテキストを取り出す（MCP向け・プレーン本文がない場合の代替） */
export function htmlToText(input: string): string {
  const withBreaks = input
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|li|h[1-6]|blockquote)\s*>/gi, "\n");
  const text = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}
