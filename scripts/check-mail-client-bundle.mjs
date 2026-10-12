// production build 後に、クライアントへ配信される JS にメールの秘密情報やサーバー専用コードが含まれていないか検査する。
// 使い方: npm run build && npm run check:mail-bundle
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../.next/static", import.meta.url).pathname;
const forbidden = [
  /MAIL_TOKEN_ENCRYPTION_KEYS/,
  /GOOGLE_CLIENT_SECRET/,
  /MAIL_OAUTH_SECRET/,
  /MAIL_DATABASE_URL/,
  /CRON_SECRET/,
  /FCM_SERVICE_ACCOUNT_JSON/,
  // Gmail のトークン交換・API はサーバーだけが呼ぶ。refresh_token という語そのものは
  // Maxwell のログイン（Supabase のブラウザ用クライアント）にも出てくるので、Google 側の窓口で見る
  /oauth2\.googleapis\.com\/token/,
  /gmail\.googleapis\.com/,
  /client_secret/,
  /BEGIN PRIVATE KEY/,
  /createCipheriv/,
  /sanitize-html/,
];
// 実際の秘密値（環境変数に設定されていれば）も検査する
for (const k of ["MAIL_TOKEN_ENCRYPTION_KEYS", "GOOGLE_CLIENT_SECRET", "MAIL_OAUTH_SECRET", "MAIL_DATABASE_URL", "CRON_SECRET"]) {
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
