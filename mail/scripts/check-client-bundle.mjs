// production build 後に、クライアントへ配信される JS に秘密情報やサーバー専用コードが含まれていないか検査する。
// 使い方: pnpm --filter @synedge/web build && node scripts/check-client-bundle.mjs
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../apps/web/.next/static", import.meta.url).pathname;
const forbidden = [
  /TOKEN_ENCRYPTION_KEYS/,
  /GOOGLE_CLIENT_SECRET/,
  /SESSION_SECRET/,
  /DATABASE_URL/,
  /FCM_SERVICE_ACCOUNT_JSON/,
  /client_secret/,
  /refresh_token/,
  /BEGIN PRIVATE KEY/,
  /createCipheriv/,
  /sanitize-html/,
];
// 実際の秘密値（環境変数に設定されていれば）も検査する
for (const k of ["TOKEN_ENCRYPTION_KEYS", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET", "DATABASE_URL"]) {
  const v = process.env[k];
  if (v && v.length >= 8) forbidden.push(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

async function* walk(dir) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) yield* walk(p);
    else if (p.endsWith(".js")) yield p;
  }
}

let found = 0;
try {
  for await (const file of walk(root)) {
    const text = await readFile(file, "utf8");
    for (const re of forbidden) {
      if (re.test(text)) {
        console.error(`NG: ${file} に ${re} が含まれています`);
        found++;
      }
    }
  }
} catch (e) {
  console.error("先に pnpm --filter @synedge/web build を実行してください", e.message);
  process.exit(2);
}
if (found) process.exit(1);
console.error("OK: クライアントバンドルに秘密情報・サーバー専用コードは見つかりませんでした");
