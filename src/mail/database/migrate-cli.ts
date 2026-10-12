// 使い方: MAIL_DATABASE_URL=postgres://... npm run mail:migrate（テスト用DBなど。本番は supabase db push）
import { migrate } from "./migrate";
import { createSql } from "./postgres";

const url = process.env.MAIL_DATABASE_URL;
if (!url) {
  console.error("MAIL_DATABASE_URL が未設定です");
  process.exit(1);
}
const sql = createSql(url, { max: 1 });
try {
  const done = await migrate(sql);
  console.error(done.length ? `適用: ${done.join(", ")}` : "適用済み（変更なし）");
} finally {
  await sql.end();
}
