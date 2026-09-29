-- The cover, as openBD links it when the book is looked up. Stored
-- rather than rebuilt from the ISBN because openBD's cover URL is not
-- derivable from it, and a book typed in by hand may have neither.
-- Books without one fall back to the National Diet Library's thumbnail
-- by ISBN in the app, so this is only ever the better picture.
alter table dag.books
  add column cover_url text
    check (char_length(cover_url) <= 500 and cover_url ~ '^https://');
