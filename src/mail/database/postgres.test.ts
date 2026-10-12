// 実DBでのテスト。MAIL_DATABASE_URL_TEST（スーパーユーザー権限の接続先）が未設定ならスキップする。
// 毎回一時データベースを作り、マイグレーションが新規DBへ適用できることから検証する。
import { randomBytes } from "node:crypto";
import { repositoryContract } from "@/mail/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { createPgRepositories, createSql, type Sql } from "./postgres";

const adminUrl = process.env.MAIL_DATABASE_URL_TEST;
const suite = adminUrl ? describe : describe.skip;

suite("Postgres", () => {
  const dbName = `mail_t_${randomBytes(4).toString("hex")}`;
  let admin: Sql;
  let sql: Sql;

  beforeAll(async () => {
    admin = createSql(adminUrl!, { max: 1 });
    await admin.unsafe(`create database ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    sql = createSql(url.toString());
    // Supabase の公開ロールを模擬する
    await sql.unsafe(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$`);
    await sql.unsafe(`grant usage on schema public to anon, authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;`);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop database if exists ${dbName} with (force)`);
    await admin?.end();
  });

  it("マイグレーションが新規DBへ適用でき、再実行しても変化しない", async () => {
    expect(await migrate(sql)).toEqual(["20261012090000_create_mail_schema.sql"]);
    expect(await migrate(sql)).toEqual([]);
  });

  it("公開ロール（anon/authenticated）からは全テーブルを読み書きできない", async () => {
    const tables = ["users", "mail_accounts", "user_settings", "devices", "notification_deliveries", "send_requests"].map((t) => `mail.${t}`);
    await sql`insert into mail.users (id, email) values (gen_random_uuid(), 'rls@example.com')`;
    for (const role of ["anon", "authenticated"]) {
      for (const t of tables) {
        await expect(
          sql.begin(async (tx) => {
            await tx.unsafe(`set local role ${role}`);
            return tx.unsafe(`select * from ${t}`);
          }),
        ).rejects.toThrow(/permission denied/);
      }
    }
    // 権限を誤って付与しても RLS により行は見えない
    await sql.unsafe(`grant usage on schema mail to authenticated; grant select on mail.users to authenticated`);
    const rows = await sql.begin(async (tx) => {
      await tx.unsafe(`set local role authenticated`);
      return tx.unsafe(`select * from mail.users`);
    });
    expect(rows).toHaveLength(0);
    await sql.unsafe(`revoke select on mail.users from authenticated; revoke usage on schema mail from authenticated`);
  });


  repositoryContract("postgres", async () => {
    await sql.unsafe(`truncate mail.users cascade`);
    return createPgRepositories(sql);
  });
});
