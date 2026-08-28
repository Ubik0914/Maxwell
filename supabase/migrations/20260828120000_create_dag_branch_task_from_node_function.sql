-- Branching from a node, rather than only from a connection.
--
-- dag.branch_task_on_edge could only ever rejoin at the edge's own
-- target, so the only way to start a parallel line of work off a task
-- was to find an edge leaving it. This takes the two endpoints
-- directly: NewTask is created between them as Source->NewTask->Target,
-- with everything already between Source and Target left alone.
--
-- The caller decides Target, so the application layer is responsible
-- for rejecting a Target that can already reach Source (see
-- validateBranch) — a NewTask spanning that pair would close a cycle.
--
-- Positions now stagger by how many connections already leave Source.
-- Branching twice off the same point used to place both nodes at
-- exactly the same coordinates, which read on the canvas as the second
-- branch having silently failed.
--
-- SECURITY INVOKER so RLS still enforces OWNER/EDITOR authorization; a
-- PL/pgSQL body is one transaction, so a failure rolls back the node
-- and both edges together.

create or replace function dag.branch_task_from_node(
  p_source_node_id uuid,
  p_target_node_id uuid,
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
  v_target_story_id uuid;
  v_source_x double precision;
  v_source_y double precision;
  v_target_x double precision;
  v_target_y double precision;
  v_source_type text;
  v_source_status text;
  v_new_status text;
  v_siblings integer;
  v_new_node_id uuid;
begin
  select story_id, position_x, position_y, type, status
    into v_story_id, v_source_x, v_source_y, v_source_type, v_source_status
  from dag.nodes where id = p_source_node_id;

  select story_id, position_x, position_y
    into v_target_story_id, v_target_x, v_target_y
  from dag.nodes where id = p_target_node_id;

  if v_story_id is null or v_target_story_id is null then
    raise exception 'NODE_NOT_FOUND';
  end if;

  if v_story_id <> v_target_story_id then
    raise exception 'NODE_NOT_FOUND';
  end if;

  -- Same rule as insert_task_on_edge and the application layer's
  -- calculateTaskAvailability: the new task's only prerequisite is the
  -- source, so it starts READY only when that source is satisfied.
  v_new_status := case
    when v_source_type = 'START' or v_source_status = 'DONE' then 'READY'
    else 'BLOCKED'
  end;

  select count(*) into v_siblings
  from dag.edges where source_node_id = p_source_node_id;

  insert into dag.nodes (story_id, type, title, description, status, position_x, position_y)
  values (
    v_story_id,
    'TASK',
    p_title,
    p_description,
    v_new_status,
    (coalesce(v_source_x, 0) + coalesce(v_target_x, 0)) / 2,
    (coalesce(v_source_y, 0) + coalesce(v_target_y, 0)) / 2
      + 140
      + greatest(v_siblings - 1, 0) * 120
  )
  returning id into v_new_node_id;

  insert into dag.edges (story_id, source_node_id, target_node_id)
  values (v_story_id, p_source_node_id, v_new_node_id);

  insert into dag.edges (story_id, source_node_id, target_node_id)
  values (v_story_id, v_new_node_id, p_target_node_id);

  return v_new_node_id;
end;
$$;

grant execute on function dag.branch_task_from_node(uuid, uuid, text, text) to authenticated;

-- Branching on an edge is now the same operation with its endpoints
-- read off the edge, so both routes place nodes the same way and there
-- is one body to keep correct.
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
  v_source_node_id uuid;
  v_target_node_id uuid;
begin
  select source_node_id, target_node_id
    into v_source_node_id, v_target_node_id
  from dag.edges
  where id = p_edge_id;

  if v_source_node_id is null then
    raise exception 'EDGE_NOT_FOUND';
  end if;

  return dag.branch_task_from_node(
    v_source_node_id,
    v_target_node_id,
    p_title,
    p_description
  );
end;
$$;

grant execute on function dag.branch_task_on_edge(uuid, text, text) to authenticated;
