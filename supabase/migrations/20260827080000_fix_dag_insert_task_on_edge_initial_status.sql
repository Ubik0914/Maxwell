-- Fix: dag.insert_task_on_edge always inserted the new task as READY,
-- even when splitting an edge whose source isn't actually satisfied
-- (a BLOCKED chain, or an unfinished TASK) - letting a task start READY
-- (and be advanced straight to DONE) without its own dependency ever
-- being done. The new task must start READY only when its source is
-- START, or a TASK already DONE; BLOCKED otherwise, mirroring
-- calculateTaskAvailability's rule in the application layer.

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

  v_new_status := case
    when v_source_type = 'START' or v_source_status = 'DONE' then 'READY'
    else 'BLOCKED'
  end;

  delete from dag.edges where id = p_edge_id;

  insert into dag.nodes (story_id, type, title, description, status, position_x, position_y)
  values (
    v_story_id,
    'TASK',
    p_title,
    p_description,
    v_new_status,
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
