-- Phase 04: RLS
-- Enables Row Level Security on all dag.* tables and defines
-- OWNER/EDITOR/VIEWER access policies scoped through workspace_members.

alter table dag.workspaces enable row level security;
alter table dag.workspace_members enable row level security;
alter table dag.stories enable row level security;
alter table dag.nodes enable row level security;
alter table dag.edges enable row level security;

-- Helper functions -----------------------------------------------------
-- SECURITY DEFINER + fixed search_path avoids RLS self-recursion when a
-- policy on one table needs to look up rows on workspace_members/stories.

create or replace function dag.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from dag.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function dag.can_edit_workspace(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from dag.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role in ('OWNER', 'EDITOR')
  );
$$;

create or replace function dag.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from dag.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role = 'OWNER'
  );
$$;

create or replace function dag.story_workspace_id(p_story_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select workspace_id from dag.stories where id = p_story_id;
$$;

-- workspaces -------------------------------------------------------------
-- SELECT also allows the creator to see a workspace they just inserted,
-- before the follow-up workspace_members(OWNER) row exists (avoids a
-- chicken-and-egg RETURNING failure on the two-step creation flow).
create policy workspaces_select on dag.workspaces for select
  using (dag.is_workspace_member(id) or created_by = auth.uid());

create policy workspaces_insert on dag.workspaces for insert
  with check (created_by = auth.uid());

create policy workspaces_update on dag.workspaces for update
  using (dag.can_edit_workspace(id))
  with check (dag.can_edit_workspace(id));

create policy workspaces_delete on dag.workspaces for delete
  using (dag.is_workspace_owner(id));

-- workspace_members --------------------------------------------------------
create policy workspace_members_select on dag.workspace_members for select
  using (dag.is_workspace_member(workspace_id));

-- Bootstrap: the workspace creator may insert themselves as OWNER.
create policy workspace_members_insert_self_owner on dag.workspace_members for insert
  with check (
    user_id = auth.uid()
    and role = 'OWNER'
    and exists (
      select 1 from dag.workspaces w
      where w.id = workspace_id and w.created_by = auth.uid()
    )
  );

-- An existing OWNER may add further members.
create policy workspace_members_insert_by_owner on dag.workspace_members for insert
  with check (dag.is_workspace_owner(workspace_id));

create policy workspace_members_update on dag.workspace_members for update
  using (dag.is_workspace_owner(workspace_id))
  with check (dag.is_workspace_owner(workspace_id));

create policy workspace_members_delete on dag.workspace_members for delete
  using (dag.is_workspace_owner(workspace_id));

-- stories -------------------------------------------------------------------
create policy stories_select on dag.stories for select
  using (dag.is_workspace_member(workspace_id));

create policy stories_insert on dag.stories for insert
  with check (dag.can_edit_workspace(workspace_id));

create policy stories_update on dag.stories for update
  using (dag.can_edit_workspace(workspace_id))
  with check (dag.can_edit_workspace(workspace_id));

create policy stories_delete on dag.stories for delete
  using (dag.can_edit_workspace(workspace_id));

-- nodes -----------------------------------------------------------------
create policy nodes_select on dag.nodes for select
  using (dag.is_workspace_member(dag.story_workspace_id(story_id)));

create policy nodes_insert on dag.nodes for insert
  with check (dag.can_edit_workspace(dag.story_workspace_id(story_id)));

create policy nodes_update on dag.nodes for update
  using (dag.can_edit_workspace(dag.story_workspace_id(story_id)))
  with check (dag.can_edit_workspace(dag.story_workspace_id(story_id)));

create policy nodes_delete on dag.nodes for delete
  using (dag.can_edit_workspace(dag.story_workspace_id(story_id)));

-- edges -----------------------------------------------------------------
create policy edges_select on dag.edges for select
  using (dag.is_workspace_member(dag.story_workspace_id(story_id)));

create policy edges_insert on dag.edges for insert
  with check (dag.can_edit_workspace(dag.story_workspace_id(story_id)));

create policy edges_update on dag.edges for update
  using (dag.can_edit_workspace(dag.story_workspace_id(story_id)))
  with check (dag.can_edit_workspace(dag.story_workspace_id(story_id)));

create policy edges_delete on dag.edges for delete
  using (dag.can_edit_workspace(dag.story_workspace_id(story_id)));

-- Base grants ----------------------------------------------------------
-- RLS only restricts rows; the authenticated role still needs table-level
-- privileges before policies are even considered.
grant usage on schema dag to authenticated;
grant select, insert, update, delete on all tables in schema dag to authenticated;
grant execute on all functions in schema dag to authenticated;
