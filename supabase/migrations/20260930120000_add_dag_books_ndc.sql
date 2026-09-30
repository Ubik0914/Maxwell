-- The book's Nippon Decimal Classification number, as the National Diet
-- Library catalogues it ("933.7", "336", "726.1"): what the library
-- shows and filters as its genre. Taken from the NDL's record when the
-- book is looked up; typed by hand otherwise, or left empty.
alter table dag.books
  add column ndc text
    check (char_length(ndc) <= 20 and ndc ~ '^[0-9]{3}(\.[0-9]+)?$');
