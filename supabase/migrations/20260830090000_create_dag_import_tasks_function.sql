-- CSV import: many tasks and their dependencies, in one transaction.
--
-- SECURITY INVOKER, like every other function here, so the existing RLS
-- policies decide whether this caller may write to this story at all. A
-- PL/pgSQL body is one transaction, which is the point: an import that
-- fails on its ninetieth row must not leave eighty-nine tasks and a
-- half-drawn graph behind for somebody to clean up by hand.
--
-- The rows arrive already checked (see planImport) — titles present,
-- keys unique, references resolved, no cycles. What is left here is the
-- part only the database can do: turn keys into ids that do not exist
-- until the insert, and wire the edges to them.

create or replace function dag.import_tasks(
  p_story_id uuid,
  -- [{ key, title, description, dueDate, priority, x, y,
  --    after: [key, …], afterIds: [uuid, …] }]
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_key text;
  v_node_id uuid;
  v_start_id uuid;
  v_goal_id uuid;
  v_ids jsonb := '{}'::jsonb;
  v_from_start boolean := false;
  v_to_goal boolean := false;
  v_depended_on text[];
begin
  -- Visible under RLS, or as good as absent. Checked up front so the
  -- caller gets this rather than a policy violation from the first
  -- insert, which says the same thing far less clearly.
  if not exists (select 1 from dag.stories where id = p_story_id) then
    raise exception 'STORY_NOT_FOUND';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'VALIDATION_ERROR';
  end if;

  if jsonb_array_length(p_rows) > 500 then
    raise exception 'VALIDATION_ERROR';
  end if;

  select id into v_start_id
  from dag.nodes where story_id = p_story_id and type = 'START';

  select id into v_goal_id
  from dag.nodes where story_id = p_story_id and type = 'GOAL';

  -- Everything a row in this import waits on, so a row nothing waits on
  -- can be recognised as an ending and led to GOAL.
  select coalesce(array_agg(distinct dependency), '{}')
    into v_depended_on
  from jsonb_array_elements(p_rows) as row_json,
       jsonb_array_elements_text(coalesce(row_json -> 'after', '[]'::jsonb))
         as dependency;

  -- Nodes first: an edge needs both ends to exist, and half of them do
  -- not exist until this loop has run.
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_key := v_row ->> 'key';

    insert into dag.nodes (
      story_id, type, title, description, status,
      due_date, priority, position_x, position_y
    )
    values (
      p_story_id,
      'TASK',
      v_row ->> 'title',
      nullif(v_row ->> 'description', ''),
      -- Every task starts READY and the caller re-derives immediately
      -- afterwards, rather than this guessing. Whether a task is
      -- blocked is a question about the whole graph, and the Status
      -- Engine is the one thing that answers it.
      'READY',
      (v_row ->> 'dueDate')::date,
      (v_row ->> 'priority')::integer,
      coalesce((v_row ->> 'x')::double precision, 0),
      coalesce((v_row ->> 'y')::double precision, 0)
    )
    returning id into v_node_id;

    v_ids := v_ids || jsonb_build_object(v_key, v_node_id);
  end loop;

  -- Then the edges, now that every key has an id.
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_key := v_row ->> 'key';
    v_node_id := (v_ids ->> v_key)::uuid;

    insert into dag.edges (story_id, source_node_id, target_node_id)
    select p_story_id, (v_ids ->> dependency)::uuid, v_node_id
    from jsonb_array_elements_text(coalesce(v_row -> 'after', '[]'::jsonb))
      as dependency
    where v_ids ? dependency;

    insert into dag.edges (story_id, source_node_id, target_node_id)
    select p_story_id, dependency::uuid, v_node_id
    from jsonb_array_elements_text(coalesce(v_row -> 'afterIds', '[]'::jsonb))
      as dependency
    -- Scoped to the story: an id from somewhere else is not a
    -- dependency, and RLS would only stop it if it were also
    -- unreadable.
    where exists (
      select 1 from dag.nodes
      where id = dependency::uuid and story_id = p_story_id and type = 'TASK'
    );

    -- A row that waits on nothing starts at the beginning; a row
    -- nothing waits on is an ending. Without these the import is a
    -- cluster floating beside the story rather than part of it.
    if v_start_id is not null
      and jsonb_array_length(coalesce(v_row -> 'after', '[]'::jsonb)) = 0
      and jsonb_array_length(coalesce(v_row -> 'afterIds', '[]'::jsonb)) = 0
    then
      insert into dag.edges (story_id, source_node_id, target_node_id)
      values (p_story_id, v_start_id, v_node_id);
      v_from_start := true;
    end if;

    if v_goal_id is not null and not (v_key = any (v_depended_on)) then
      insert into dag.edges (story_id, source_node_id, target_node_id)
      values (p_story_id, v_node_id, v_goal_id);
      v_to_goal := true;
    end if;
  end loop;

  -- A story starts with START wired straight to GOAL. Once this import
  -- runs from one to the other, that edge says the story is finished
  -- the moment it begins — so it goes, exactly as splicing a task onto
  -- an edge removes the edge it split.
  if v_from_start and v_to_goal then
    delete from dag.edges
    where story_id = p_story_id
      and source_node_id = v_start_id
      and target_node_id = v_goal_id;
  end if;

  -- In the order the rows came in, so the caller can pair an id back to
  -- the row it came from. (jsonb_each_text over the key->id map would
  -- hand them back in key order, which is not the caller's order.)
  return jsonb_build_object(
    'nodeIds', (
      select coalesce(jsonb_agg(v_ids -> (row_json ->> 'key') order by ord), '[]'::jsonb)
      from jsonb_array_elements(p_rows) with ordinality as t(row_json, ord)
    )
  );
end;
$$;

grant execute on function dag.import_tasks(uuid, jsonb) to authenticated;
