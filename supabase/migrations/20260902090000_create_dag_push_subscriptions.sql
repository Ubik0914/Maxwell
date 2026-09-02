-- Web push subscriptions
-- One row per device that agreed to be told when its owner's graph
-- moves. What it holds is what RFC 8291 needs to encrypt a message to
-- that device: where to post it, and the two keys it is sealed with.
--
-- Scoped to a user, not to a workspace. A subscription is a way of
-- reaching somebody's phone, and the only person who ever needs to read
-- one is its owner — the notifications Maxwell sends are sent to the
-- account that caused the change, on the account's own devices. That is
-- also why there is no policy here allowing a workspace member to see
-- another member's row: it would hand one member the ability to push
-- arbitrary notifications to another's lock screen, which is not a
-- thing being in a workspace together ought to buy.

create table dag.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The push service's URL for this device. Unique because it *is* the
  -- device's identity: re-subscribing the same browser yields the same
  -- endpoint, and that has to update the row rather than add one, or a
  -- notification arrives twice.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- Only so somebody can tell which of their devices a row is, on a
  -- screen that lists them. Never matched on.
  user_agent text check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on dag.push_subscriptions(user_id);

create trigger push_subscriptions_set_updated_at
  before update on dag.push_subscriptions
  for each row execute function dag.set_updated_at();

alter table dag.push_subscriptions enable row level security;

create policy push_subscriptions_select on dag.push_subscriptions for select
  using (user_id = auth.uid());

create policy push_subscriptions_insert on dag.push_subscriptions for insert
  with check (user_id = auth.uid());

create policy push_subscriptions_update on dag.push_subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_subscriptions_delete on dag.push_subscriptions for delete
  using (user_id = auth.uid());

grant select, insert, update, delete on dag.push_subscriptions to authenticated;
