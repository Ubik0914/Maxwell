-- OAuth 2.1 authorization server (RFC 6749 / RFC 7591 / RFC 8707 / MCP
-- authorization spec), so claude.ai / Claude Desktop can add Maxwell as a
-- custom connector without a hand-carried Bearer token (see mcp/README.md).
--
-- Maxwell issues no tokens of its own: an "access token" handed out here
-- *is* a real Supabase session access token, and "refresh" *is*
-- supabase.auth.refreshSession. The only new concept is the short-lived
-- authorization code that carries a session from the browser (where the
-- user typed a password) to the token endpoint (where the client has
-- none). That keeps every existing RLS policy and every existing
-- /api/v1 route unchanged — a token minted through /oauth/token is
-- indistinguishable, to the rest of the app, from one minted through
-- POST /api/v1/auth/token.

-- oauth_clients -------------------------------------------------------------
-- Dynamic Client Registration (RFC 7591) is deliberately open — anyone
-- can register, the same way anyone can sign up for an account. Nothing
-- secret lives here: only public clients (token_endpoint_auth_method
-- "none") are supported, so there is no client_secret to protect and
-- nothing wrong with anon reading rows back by client_id. Authorization
-- itself is guarded downstream by PKCE and the consent screen at
-- /oauth/authorize, which shows the caller exactly which redirect_uri a
-- client is registered for before anything is granted.
create table dag.oauth_clients (
  client_id text primary key,
  client_name text check (char_length(client_name) <= 200),
  redirect_uris text[] not null check (cardinality(redirect_uris) > 0),
  created_at timestamptz not null default now()
);

alter table dag.oauth_clients enable row level security;

create policy oauth_clients_select on dag.oauth_clients for select
  using (true);

create policy oauth_clients_insert on dag.oauth_clients for insert
  with check (true);

grant usage on schema dag to anon;
grant select, insert on dag.oauth_clients to anon;
grant select, insert on dag.oauth_clients to authenticated;

-- oauth_authorization_codes --------------------------------------------------
-- A code is single-use and lives seconds, so what is stored here is only
-- ever in flight between a redirect and the token exchange that follows
-- it within the same handshake. access_token/refresh_token are the real
-- Supabase session obtained when the user authenticated at /oauth/authorize
-- — handed back verbatim by oauth_redeem_code() below, not re-derived.
--
-- code_hash, not code: the row is looked up (and consumed) by
-- SECURITY DEFINER function only, keyed on a value nothing but the
-- holder of the original 256-bit code could compute, so a leaked table
-- row is no more useful than a leaked password hash.
create table dag.oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null references dag.oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256' check (code_challenge_method = 'S256'),
  resource text,
  scope text,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_in integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table dag.oauth_authorization_codes enable row level security;

-- Written once, by the user it belongs to, from the consent step in
-- /oauth/authorize (a normal authenticated request, cookie session and
-- all). Nothing reads or deletes it through PostgREST — that only ever
-- happens inside oauth_redeem_code(), so there are no select/update/delete
-- grants here at all, for anon or authenticated.
create policy oauth_authorization_codes_insert on dag.oauth_authorization_codes for insert
  with check (user_id = auth.uid());

grant insert on dag.oauth_authorization_codes to authenticated;

-- oauth_redeem_code -----------------------------------------------------
-- The one place this handshake needs to bypass RLS on purpose: the token
-- endpoint has no session at all (that is the problem a code solves), so
-- it cannot be "the row's owner" the way every other write in this schema
-- requires. SECURITY DEFINER makes that trapdoor explicit and narrow —
-- one hash in, one matching unexpired row out, deleted in the same
-- statement so a code cannot be redeemed twice even under a concurrent
-- retry. Everything this function does not touch stays exactly as
-- RLS-governed as before.
create or replace function dag.oauth_redeem_code(p_code_hash text)
returns table (
  client_id text,
  redirect_uri text,
  code_challenge text,
  code_challenge_method text,
  resource text,
  scope text,
  user_id uuid,
  access_token text,
  refresh_token text,
  expires_in integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Opportunistic sweep: nobody ever comes back for a code that expired
  -- unredeemed, so this is the only cleanup an abandoned handshake gets.
  delete from dag.oauth_authorization_codes t where t.expires_at <= now();

  return query
    delete from dag.oauth_authorization_codes t
    where t.code_hash = p_code_hash
      and t.expires_at > now()
    returning
      t.client_id, t.redirect_uri, t.code_challenge, t.code_challenge_method,
      t.resource, t.scope, t.user_id, t.access_token, t.refresh_token, t.expires_in;
end;
$$;

grant execute on function dag.oauth_redeem_code(text) to anon;
grant execute on function dag.oauth_redeem_code(text) to authenticated;
