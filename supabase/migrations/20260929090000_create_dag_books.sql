-- Books: the library that lives at "/".
--
-- Maxwell moved to /maxwell and the root became a catalogue of the
-- books somebody owns. It shares the sign-in and the database with
-- Maxwell, and nothing else: a book is not a task, has no story and no
-- workspace, and belongs to the person who shelved it.
--
-- It sits in the dag schema only because that is the schema the API
-- already exposes. A schema of its own would need the PostgREST
-- exposed-schemas setting changed by hand on every project, and the
-- table is no less separate for sharing a namespace.

create table dag.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  authors text check (char_length(authors) <= 500),
  publisher text check (char_length(publisher) <= 200),
  -- As the book says it, not as a date: a colophon gives "2009-07" far
  -- more often than a day, and inventing the 1st would be a lie.
  published text check (char_length(published) <= 20),
  -- Yen, as printed on the cover. Null when nobody wrote it down.
  price integer check (price >= 0),
  -- Always the 13-digit form. The app converts ISBN-10 on the way in,
  -- so the same book cannot be shelved twice under two spellings.
  isbn text check (isbn ~ '^97[89][0-9]{10}$'),
  -- Where it physically is: "自宅", "会社", a shelf number. Free text,
  -- because nobody's house has the same shelves.
  location text check (char_length(location) <= 100),
  reading_status text not null default 'UNREAD'
    check (reading_status in ('UNREAD', 'READING', 'READ')),
  -- Who has it right now, if not the owner. Null means it is home.
  lent_to text check (char_length(lent_to) <= 100),
  note text check (char_length(note) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index books_owner_id_idx on dag.books(owner_id);

-- One copy of an ISBN per owner. Two copies of the same book on one
-- shelf is almost always the same scan twice.
create unique index books_owner_isbn_key on dag.books(owner_id, isbn)
  where isbn is not null;

create trigger books_set_updated_at
  before update on dag.books
  for each row execute function dag.set_updated_at();

alter table dag.books enable row level security;

create policy books_select on dag.books for select
  using (owner_id = auth.uid());

create policy books_insert on dag.books for insert
  with check (owner_id = auth.uid());

create policy books_update on dag.books for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy books_delete on dag.books for delete
  using (owner_id = auth.uid());

grant select, insert, update, delete on dag.books to authenticated;
