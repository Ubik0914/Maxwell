-- メール（旧 Synedge）のスキーマ。Maxwell と同じ Supabase の `mail` スキーマに置く。
-- 方針（仕様7章）:
--   - メール本文・件名・アドレス帳は保存しない。Gmail を正本とする
--   - トークンはアプリ側で AES-256-GCM 暗号化した文字列のみ保存（鍵はDBに置かない）
--   - 全テーブルで RLS を有効にし、anon / authenticated ロールには一切のポリシーを与えない
--     → Supabase の公開API（PostgREST）経由では読めない。サーバーのみ MAIL_DATABASE_URL で接続する
--   - 利用者は Maxwell の Supabase Auth のユーザー。mail.users.id = auth.users.id（素の Postgres
--     でもテストできるよう外部キーは張らない）。ログイン・セッションは Supabase が持つ

create extension if not exists pgcrypto;
create schema if not exists mail;

create table if not exists mail.users (
  id uuid primary key,
  email text not null check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table if not exists mail.mail_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references mail.users(id) on delete cascade,
  provider text not null check (provider in ('gmail')),
  email text not null check (email = lower(email)),
  refresh_token_enc text not null,
  access_token_enc text,
  access_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'reauth_required')),
  status_reason text,
  history_id text check (history_id ~ '^[0-9]+$'),
  last_synced_at timestamptz,
  watch_expires_at timestamptz,
  watch_renewed_at timestamptz,
  watch_last_error text,
  sync_lease_owner text,
  sync_lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, email)
);
create index if not exists mail_accounts_user_idx on mail.mail_accounts(user_id);

create table if not exists mail.user_settings (
  user_id uuid primary key references mail.users(id) on delete cascade,
  notifications_enabled boolean not null default true,
  -- 既定はプレビュー非表示（ロック画面に件名・送信者を出さない安全側）
  notification_preview boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists mail.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references mail.users(id) on delete cascade,
  fcm_token text not null unique,
  platform text not null check (platform in ('android', 'web')),
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists devices_user_idx on mail.devices(user_id) where disabled_at is null;

-- 通知の重複排除キー兼配信状態。メッセージIDのみ（件名・本文は持たない）
create table if not exists mail.notification_deliveries (
  account_id uuid not null references mail.mail_accounts(id) on delete cascade,
  message_id text not null,
  thread_id text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  last_error_code text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, message_id)
);
create index if not exists notification_deliveries_due_idx
  on mail.notification_deliveries(next_attempt_at) where status = 'failed' and next_attempt_at is not null;
create index if not exists notification_deliveries_created_idx on mail.notification_deliveries(created_at);

-- 送信の冪等キー（二重送信防止と、結果不明時の照合）
create table if not exists mail.send_requests (
  user_id uuid not null references mail.users(id) on delete cascade,
  idempotency_key uuid not null,
  status text not null check (status in ('pending', 'sent', 'failed', 'unknown')),
  rfc822_message_id text not null,
  message_id text,
  thread_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

-- RLS：ポリシーを作らない＝ anon / authenticated からは全行拒否
alter table mail.users enable row level security;
alter table mail.mail_accounts enable row level security;
alter table mail.user_settings enable row level security;
alter table mail.devices enable row level security;
alter table mail.notification_deliveries enable row level security;
alter table mail.send_requests enable row level security;

-- Supabase の公開ロールから権限を外す（ロールがない素のPostgresでは何もしない）
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format(
        'revoke all on all tables in schema mail from %I; revoke usage on schema mail from %I',
        r, r
      );
    end if;
  end loop;
end
$$;
