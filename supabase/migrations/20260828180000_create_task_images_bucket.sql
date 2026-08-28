-- Somewhere for the pictures in a task's description to live.
--
-- A description is Markdown and Markdown has images, so until now the
-- only way to put one in a task was to host it somewhere else and paste
-- a link. That makes the picture someone else's problem: it can be
-- taken down, it can be behind a login the rest of the workspace does
-- not have, and it leaks the fact that it was looked at to whoever is
-- hosting it.
--
-- The bucket is private. A workspace's tasks are private, and a picture
-- in one is part of the task — a public bucket with unguessable names
-- is the usual shortcut, and it means anyone who ever sees a URL can
-- read that file forever, including after the person who shared it
-- leaves. The application serves these through a route of its own that
-- checks the session on every request, so the URL stored in a
-- description stays valid without ever being a capability.
--
-- Paths are `<story_id>/<uuid>.<ext>`. The story in the first folder is
-- what the policies below read to decide who may touch the file, so it
-- is not decoration — a file outside that shape belongs to no story and
-- is reachable by nobody.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-images',
  'task-images',
  false,
  10485760, -- 10 MB: generous for a screenshot, small enough to refuse a video
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- SVG is deliberately not in that list. It is a document that can carry
-- script, not a picture, and the one thing worse than an image nobody
-- can see is one that runs.

/*
 * Which story a file belongs to, read from its path.
 *
 * Returns null rather than raising when the first folder is not a uuid,
 * so a malformed path simply matches no story and every policy below
 * denies it. Raising would turn a bad upload into a failed query for
 * everyone reading the bucket.
 */
create or replace function dag.story_id_from_object_path(p_path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_path))[1]
         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_path))[1])::uuid
  end;
$$;

comment on function dag.story_id_from_object_path(text) is
  'The story a task-images object belongs to, or NULL if the path names none.';

-- Reading follows the story: anyone who can see the task can see the
-- picture in it, and nobody else.
drop policy if exists task_images_select on storage.objects;
create policy task_images_select on storage.objects for select
  to authenticated
  using (
    bucket_id = 'task-images'
    and dag.is_workspace_member(
      dag.story_workspace_id(dag.story_id_from_object_path(name))
    )
  );

-- Writing follows the right to edit the story, which is the same right
-- as writing the description the picture is going into.
drop policy if exists task_images_insert on storage.objects;
create policy task_images_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'task-images'
    and dag.can_edit_workspace(
      dag.story_workspace_id(dag.story_id_from_object_path(name))
    )
  );

drop policy if exists task_images_delete on storage.objects;
create policy task_images_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'task-images'
    and dag.can_edit_workspace(
      dag.story_workspace_id(dag.story_id_from_object_path(name))
    )
  );
