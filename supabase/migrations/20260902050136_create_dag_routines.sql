-- Routines: the repeating half of the workspace.
--
-- A story is a DAG that ends. A routine never does — it comes back on
-- the days it is set for, and "done" means done *today*. Those two are
-- the same word for different things, which is why this is a table
-- rather than a flag on dag.nodes: a routine reset to READY every
-- night would drag the whole downstream graph back to BLOCKED with it
-- (see recalculateDownstream), and it would sit in the Current
-- Frontier forever, which is the one question the graph exists to
-- answer.
--
-- So routines have no edges, no status and no GOAL. They have days
-- they are due on, and a log of the days they were done.

create table dag.routines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references dag.workspaces(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  description text check (char_length(description) <= 5000),
  -- Which weekdays it is due on, as a bitmask: bit N is weekday N with
  -- 0 = Sunday, matching JavaScript's getDay() and the WEEKDAYS array
  -- the calendar already draws its headings from. 127 is every day.
  --
  -- A mask rather than seven columns or an array because every read of
  -- it is a membership test, and every write is the whole set at once —
  -- nobody ever sets Tuesday without knowing about Wednesday. 0 is
  -- excluded: a routine due on no day is not a routine, it is a note.
  weekdays smallint not null default 127 check (weekdays between 1 and 127),
  -- Paused rather than deleted. A routine you have stopped doing is
  -- worth keeping, because the log under it is a record of when you
  -- did do it.
  active boolean not null default true,
  sort_order integer,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index routines_workspace_id_idx on dag.routines(workspace_id);

-- routine_completions -------------------------------------------------------
-- One row per day a routine was done. Ticking the box inserts a row;
-- unticking deletes it; nothing resets at midnight because nothing has
-- to — tomorrow simply has no row yet. The status of a routine is
-- derived from this table the way a task's BLOCKED is derived from its
-- edges, and for the same reason: a stored answer is one that can go
-- stale while nobody is looking.
create table dag.routine_completions (
  routine_id uuid not null references dag.routines(id) on delete cascade,
  on_date date not null,
  completed_by uuid not null references auth.users(id),
  completed_at timestamptz not null default now(),
  primary key (routine_id, on_date)
);

create index routine_completions_on_date_idx on dag.routine_completions(on_date);

create trigger routines_set_updated_at
  before update on dag.routines
  for each row execute function dag.set_updated_at();

-- RLS ----------------------------------------------------------------------
alter table dag.routines enable row level security;
alter table dag.routine_completions enable row level security;

-- The same trapdoor dag.story_workspace_id opens for nodes and edges:
-- a policy on a child table needs the parent's workspace, and reading
-- the parent under RLS from inside a policy is how you get recursion.
create or replace function dag.routine_workspace_id(p_routine_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select workspace_id from dag.routines where id = p_routine_id;
$$;

create policy routines_select on dag.routines for select
  using (dag.is_workspace_member(workspace_id));

create policy routines_insert on dag.routines for insert
  with check (dag.can_edit_workspace(workspace_id));

create policy routines_update on dag.routines for update
  using (dag.can_edit_workspace(workspace_id))
  with check (dag.can_edit_workspace(workspace_id));

create policy routines_delete on dag.routines for delete
  using (dag.can_edit_workspace(workspace_id));

create policy routine_completions_select on dag.routine_completions for select
  using (dag.is_workspace_member(dag.routine_workspace_id(routine_id)));

-- A completion says who did it, so it may only be written in your own
-- name — unlike a task's status, which anyone editing may set on
-- anyone's behalf. A log with someone else's name in it is not a log.
create policy routine_completions_insert on dag.routine_completions for insert
  with check (
    completed_by = auth.uid()
    and dag.can_edit_workspace(dag.routine_workspace_id(routine_id))
  );

create policy routine_completions_delete on dag.routine_completions for delete
  using (dag.can_edit_workspace(dag.routine_workspace_id(routine_id)));

-- Base grants --------------------------------------------------------------
-- The blanket grant in the RLS migration only reached the tables that
-- existed when it ran; these two need saying out loud.
grant select, insert, update, delete on dag.routines to authenticated;
grant select, insert, delete on dag.routine_completions to authenticated;
grant execute on function dag.routine_workspace_id(uuid) to authenticated;
