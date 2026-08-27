-- Hardens dag.set_updated_at against a mutable search_path (flagged by
-- Supabase's security advisor after Phase 04's RLS migration).

create or replace function dag.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
