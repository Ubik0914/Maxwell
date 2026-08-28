-- A manual rank for tasks, so a list and a board can be reordered by
-- hand.
--
-- Until now every ordering in the product was derived — urgency, due
-- date, dependency depth — which is right for the question "what should
-- I look at first" and useless for "these three are the same to the
-- computer and not to me". Dragging a row without somewhere to put the
-- result would be a lie about what had been saved, so the rank is a
-- column.
--
-- Nullable, and null means "never placed by hand". Backfilling every
-- existing task with an arbitrary rank would invent an opinion nobody
-- expressed; instead the application sorts unranked tasks after ranked
-- ones and falls back to the urgency order among them, so a story
-- nobody has reordered looks exactly as it does today.
--
-- It is per story, not per board column: a task keeps its place when it
-- changes status, which is the behaviour you want when you drag a card
-- from Ready to In progress and back.

alter table dag.nodes
  add column if not exists sort_order integer;

comment on column dag.nodes.sort_order is
  'Manual rank within the story. NULL = never placed by hand; the application orders those after ranked tasks.';

-- Rewrites the whole ordering in one statement.
--
-- Gap-based ranks (insert halfway between neighbours) avoid touching
-- other rows, but they need periodic renumbering and a story holds tens
-- of tasks, not millions — so the simple thing is also the correct one
-- here. Sending the full order means the client never has to reason
-- about what the neighbours currently are, and two people reordering at
-- once produce one of their two orders rather than an interleaving of
-- both.
--
-- SECURITY INVOKER so RLS still decides who may write; the whole
-- renumber is one transaction, so a story can never be left half
-- ordered.
create or replace function dag.reorder_nodes(
  p_story_id uuid,
  p_node_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Every id has to belong to the story being reordered. Without this a
  -- caller could renumber another story's tasks by naming them here,
  -- since the update itself would still pass RLS for rows they can
  -- write.
  if exists (
    select 1
    from unnest(p_node_ids) as requested(id)
    left join dag.nodes n on n.id = requested.id
    where n.id is null or n.story_id <> p_story_id
  ) then
    raise exception 'NODE_NOT_FOUND';
  end if;

  update dag.nodes n
  set sort_order = ranked.position
  from (
    select id, (ordinality - 1)::integer as position
    from unnest(p_node_ids) with ordinality as t(id, ordinality)
  ) as ranked
  where n.id = ranked.id
    and n.sort_order is distinct from ranked.position;
end;
$$;

grant execute on function dag.reorder_nodes(uuid, uuid[]) to authenticated;
