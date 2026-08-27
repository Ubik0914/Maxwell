-- Phase 03: Database Schema
-- Creates a dedicated "dag" schema so the DAG Task Manager tables never
-- collide with unrelated tables already present in this Supabase project.

create schema if not exists dag;

-- workspaces --------------------------------------------------------------
create table dag.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- workspace_members ---------------------------------------------------------
create table dag.workspace_members (
  workspace_id uuid not null references dag.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER', 'EDITOR', 'VIEWER')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on dag.workspace_members(user_id);

-- stories -------------------------------------------------------------------
create table dag.stories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references dag.workspaces(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  description text check (char_length(description) <= 5000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stories_workspace_id_idx on dag.stories(workspace_id);

-- nodes -----------------------------------------------------------------
create table dag.nodes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references dag.stories(id) on delete cascade,
  type text not null check (type in ('START', 'TASK', 'GOAL')),
  title text not null check (char_length(title) <= 200),
  description text check (char_length(description) <= 5000),
  status text check (status in ('BLOCKED', 'READY', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
  assignee_id uuid references auth.users(id),
  priority integer check (priority between 1 and 4),
  due_date date,
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nodes_status_requires_task check (
    (type = 'TASK' and status is not null) or
    (type <> 'TASK' and status is null)
  )
);

create index nodes_story_id_idx on dag.nodes(story_id);

-- edges -----------------------------------------------------------------
create table dag.edges (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references dag.stories(id) on delete cascade,
  source_node_id uuid not null references dag.nodes(id) on delete cascade,
  target_node_id uuid not null references dag.nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_node_id, target_node_id),
  constraint edges_no_self_loop check (source_node_id <> target_node_id)
);

create index edges_story_id_idx on dag.edges(story_id);
create index edges_source_node_id_idx on dag.edges(source_node_id);
create index edges_target_node_id_idx on dag.edges(target_node_id);

-- updated_at auto-touch trigger ---------------------------------------------
create or replace function dag.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspaces_set_updated_at
  before update on dag.workspaces
  for each row execute function dag.set_updated_at();

create trigger stories_set_updated_at
  before update on dag.stories
  for each row execute function dag.set_updated_at();

create trigger nodes_set_updated_at
  before update on dag.nodes
  for each row execute function dag.set_updated_at();
