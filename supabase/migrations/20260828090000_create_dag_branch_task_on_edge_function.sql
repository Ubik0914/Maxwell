-- Branching: the second thing an edge's "+" can do.
--
-- Where dag.insert_task_on_edge SPLITS A->B into A->NewTask->B (the old
-- edge is removed, so the new task lands in series), this one KEEPS
-- A->B and adds A->NewTask->B alongside it, so the new task is a second
-- prerequisite running parallel to the existing path and rejoining at
-- B. That rejoin is the point: B stays reachable only once both paths
-- are done, and B's route to GOAL still carries the new work.
--
-- SECURITY INVOKER so RLS still enforces OWNER/EDITOR authorization; a
-- PL/pgSQL body is one transaction, so a failure rolls back the node
-- and both edges together.

create or replace function dag.branch_task_on_edge(
  p_edge_id uuid,
  p_title text,
  p_description text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_source_node_id uuid;
  v_target_node_id uuid;
  v_source_x double precision;
  v_source_y double precision;
  v_target_x double precision;
  v_target_y double precision;
  v_source_type text;
  v_source_status text;
  v_new_status text;
  v_new_node_id uuid;
begin
  select story_id, source_node_id, target_node_id
    into v_story_id, v_source_node_id, v_target_node_id
  from dag.edges
  where id = p_edge_id;

  if v_story_id is null then
    raise exception 'EDGE_NOT_FOUND';
  end if;

  select position_x, position_y, type, status
    into v_source_x, v_source_y, v_source_type, v_source_status
  from dag.nodes where id = v_source_node_id;

  select position_x, position_y into v_target_x, v_target_y
  from dag.nodes where id = v_target_node_id;

  -- Same rule as insert_task_on_edge and the application layer's
  -- calculateTaskAvailability: the new task's only prerequisite is the
  -- source, so it starts READY only when that source is actually
  -- satisfied.
  v_new_status := case
    when v_source_type = 'START' or v_source_status = 'DONE' then 'READY'
    else 'BLOCKED'
  end;

  -- Offset below the midpoint rather than on it: the original A->B edge
  -- is still there, and a node dropped exactly on it would be drawn
  -- straight through the path it is meant to run beside.
  insert into dag.nodes (story_id, type, title, description, status, position_x, position_y)
  values (
    v_story_id,
    'TASK',
    p_title,
    p_description,
    v_new_status,
    (coalesce(v_source_x, 0) + coalesce(v_target_x, 0)) / 2,
    (coalesce(v_source_y, 0) + coalesce(v_target_y, 0)) / 2 + 140
  )
  returning id into v_new_node_id;

  insert into dag.edges (story_id, source_node_id, target_node_id)
  values (v_story_id, v_source_node_id, v_new_node_id);

  insert into dag.edges (story_id, source_node_id, target_node_id)
  values (v_story_id, v_new_node_id, v_target_node_id);

  return v_new_node_id;
end;
$$;

grant execute on function dag.branch_task_on_edge(uuid, text, text) to authenticated;
