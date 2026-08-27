-- Phase 08: Story Creation
-- Atomic (story + START node + GOAL node + START->GOAL edge) creation.
-- SECURITY INVOKER so the existing RLS policies on stories/nodes/edges
-- still enforce OWNER/EDITOR authorization inside the function body; a
-- PL/pgSQL function body runs as a single transaction, so any failure
-- (including an RLS violation) rolls back everything inserted so far.

create or replace function dag.create_story(
  p_workspace_id uuid,
  p_title text,
  p_description text,
  p_start_state text,
  p_goal_state text
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
  insert into dag.stories (workspace_id, title, description, created_by)
  values (p_workspace_id, p_title, p_description, auth.uid())
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

grant execute on function dag.create_story(uuid, text, text, text, text) to authenticated;
