-- Projects: the shelf a workspace's stories stand on.
--
-- A workspace is who can see things — one team, one set of members,
-- one answer from RLS. That made it the container for stories by
-- default, which is fine until one team runs several efforts at once
-- and the drawer becomes a list of everything anyone is doing.
--
-- So a project groups stories, and nothing else. It is not a DAG, it
-- carries no status of its own, and it is not a permission boundary:
-- the moment a project could be shared differently from its workspace,
-- every policy below would need a second axis to answer along, and the
-- one question RLS answers today ("are you in this workspace?") would
-- become two.
--
-- Nor does it hold progress. A project's tallies are the sum of its
-- stories' tallies, which are themselves derived from nodes — and a
-- derived number kept in a column is a number that can be wrong while
-- nobody is looking (the same reason BLOCKED is not stored).

create table dag.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references dag.workspaces(id) on delete cascade,
  name text not null check (char_length(name) <= 100),
  description text check (char_length(description) <= 5000),
  -- Tidied away rather than deleted, the way a story is archived: the
  -- stories inside an archived project are still live work, they have
  -- just stopped being something you scroll past every day.
  archived_at timestamptz,
  sort_order integer,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_workspace_id_idx on dag.projects(workspace_id);

create trigger projects_set_updated_at
  before update on dag.projects
  for each row execute function dag.set_updated_at();

-- stories.project_id --------------------------------------------------------
-- Nullable, so every story that already exists stays exactly as it is
-- and no backfill is needed. "Unfiled" is not a state a story is put
-- into; it is simply the absence of a shelf, which is why there is no
-- default project and no sentinel row.
alter table dag.stories add column project_id uuid;

create index stories_project_id_idx on dag.stories(project_id);

-- The story keeps its own workspace_id rather than reaching the
-- workspace through the project. Two reasons, and the second is the
-- one that matters: every policy below asks
-- dag.is_workspace_member(workspace_id) directly, and going through
-- the project would add a hop to every read — but a story with no
-- project has no hop to take at all, and would fall out of RLS
-- entirely.
--
-- That leaves workspace_id denormalised, so the composite foreign key
-- below closes the gap the denormalisation opens: a story can only
-- point at a project that lives in the same workspace it does. Not a
-- rule the application remembers to keep — one the database cannot
-- break.
alter table dag.projects
  add constraint projects_id_workspace_unique unique (id, workspace_id);

-- ON DELETE SET NULL (project_id) nulls only that column, leaving
-- workspace_id (which is NOT NULL) alone. Deleting a project therefore
-- empties the shelf without touching a single story: a project is a
-- shelf, not a room, and this is the whole difference between deleting
-- one and deleting a workspace. It is also why there is no
-- type-the-name confirmation on the way out.
--
-- Column lists in ON DELETE SET NULL need PostgreSQL 15 or later.
alter table dag.stories
  add constraint stories_project_same_workspace
  foreign key (project_id, workspace_id)
  references dag.projects(id, workspace_id)
  on delete set null (project_id);

-- RLS ----------------------------------------------------------------------
-- The same shape as stories, because a project is visible on exactly
-- the same terms as the stories it holds.
alter table dag.projects enable row level security;

create policy projects_select on dag.projects for select
  using (dag.is_workspace_member(workspace_id));

create policy projects_insert on dag.projects for insert
  with check (dag.can_edit_workspace(workspace_id));

create policy projects_update on dag.projects for update
  using (dag.can_edit_workspace(workspace_id))
  with check (dag.can_edit_workspace(workspace_id));

-- EDITOR, not OWNER. Deleting a workspace takes its stories with it;
-- deleting a project takes nothing, so it does not need the heavier
-- hand that dag.is_workspace_owner is there for.
create policy projects_delete on dag.projects for delete
  using (dag.can_edit_workspace(workspace_id));

-- Base grants --------------------------------------------------------------
-- The blanket grant in the RLS migration only reached the tables that
-- existed when it ran.
grant select, insert, update, delete on dag.projects to authenticated;

-- Realtime -----------------------------------------------------------------
alter publication supabase_realtime add table dag.projects;

-- create_story --------------------------------------------------------------
-- A story can be filed at the moment it is made. The parameter is last
-- and defaults to null so that every existing caller — the dialog, the
-- REST route, the CLI, the MCP server — keeps working untouched while
-- it files nothing.
drop function if exists dag.create_story(uuid, text, text, text, text);

create or replace function dag.create_story(
  p_workspace_id uuid,
  p_title text,
  p_description text,
  p_start_state text,
  p_goal_state text,
  p_project_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_start_node_id uuid;
  v_goal_node_id uuid;
begin
  insert into dag.stories (workspace_id, title, description, project_id, created_by)
  values (p_workspace_id, p_title, p_description, p_project_id, auth.uid())
  returning id into v_story_id;

  insert into dag.nodes (story_id, type, title, position_x, position_y)
  values (v_story_id, 'START', p_start_state, 100, 300)
  returning id into v_start_node_id;

  insert into dag.nodes (story_id, type, title, position_x, position_y)
  values (v_story_id, 'GOAL', p_goal_state, 900, 300)
  returning id into v_goal_node_id;

  insert into dag.edges (story_id, source_node_id, target_node_id)
  values (v_story_id, v_start_node_id, v_goal_node_id);

  return v_story_id;
end;
$$;

grant execute on function dag.create_story(uuid, text, text, text, text, uuid) to authenticated;
