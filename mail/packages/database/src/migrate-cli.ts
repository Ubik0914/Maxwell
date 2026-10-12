// 使い方: DATABASE_URL=postgres://... pnpm db:migrate
import { migrate } from "./migrate";
import { createSql } from "./postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL が未設定です");
  process.exit(1);
}
const sql = createSql(url, { max: 1 });
try {
  const done = await migrate(sql);
  console.error(done.length ? `適用: ${done.join(", ")}` : "適用済み（変更なし）");
} finally {
  await sql.end();
}
