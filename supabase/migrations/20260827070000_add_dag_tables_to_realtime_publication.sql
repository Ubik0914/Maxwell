-- Phase 16: Realtime
-- The default supabase_realtime publication only covers tables added to
-- it explicitly. Add the dag schema tables the Story Graph screen needs
-- to hear about live: nodes, edges, stories.

alter publication supabase_realtime add table dag.nodes;
alter publication supabase_realtime add table dag.edges;
alter publication supabase_realtime add table dag.stories;
