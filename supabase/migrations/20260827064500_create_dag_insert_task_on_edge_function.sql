-- Phase 12: Edge CRUD
-- Atomically replaces an edge A->B with A->NewTask->B: delete the old
-- edge, insert the new TASK node, insert both new edges. SECURITY
-- INVOKER so RLS still enforces OWNER/EDITOR authorization; a PL/pgSQL
-- function body is one transaction, so any failure rolls everything back.

create or replace function dag.insert_task_on_edge(
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
  v_new_node_id uuid;
begin
  select story_id, source_node_id, target_node_id
    into v_story_id, v_source_node_id, v_target_node_id
  from dag.edges
  where id = p_edge_id;

  if v_story_id is null then
    raise exception 'EDGE_NOT_FOUND';
  end if;

  select position_x, position_y into v_source_x, v_source_y
  from dag.nodes where id = v_source_node_id;

  select position_x, position_y into v_target_x, v_target_y
  from dag.nodes where id = v_target_node_id;

  delete from dag.edges where id = p_edge_id;

  insert into dag.nodes (story_id, type, title, description, status, position_x, position_y)
  values (
    v_story_id,
    'TASK',
    p_title,
    p_description,
    'READY',
    (coalesce(v_source_x, 0) + coalesce(v_target_x, 0)) / 2,
    (coalesce(v_source_y, 0) + coalesce(v_target_y, 0)) / 2
  )
  returning id into v_new_node_id;

  insert into dag.edges (story_id, source_node_id, target_node_id)
  values (v_story_id, v_source_node_id, v_new_node_id);

  insert into dag.edges (story_id, source_node_id, target_node_id)
  values (v_story_id, v_new_node_id, v_target_node_id);

  return v_new_node_id;
end;
$$;

grant execute on function dag.insert_task_on_edge(uuid, text, text) to authenticated;
