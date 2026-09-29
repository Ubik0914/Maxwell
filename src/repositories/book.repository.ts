import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ShelvedBook } from "@/domain/library/filter";
import type { BookFields } from "@/lib/validation/book";

type Client = SupabaseClient<Database, "dag">;

const COLUMNS =
  "id, title, authors, publisher, published, price, isbn, location, lent_to, note, created_at";

/** Postgres' unique_violation — here, the same ISBN shelved twice. */
export const DUPLICATE_ISBN = "23505";

/** Every book the signed-in user owns. RLS does the "owns". */
export async function listBooks(supabase: Client): Promise<ShelvedBook[]> {
  const { data, error } = await supabase
    .from("books")
    .select(COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/** One book, or null when it does not exist or is not the caller's. */
export async function findBook(
  supabase: Client,
  bookId: string,
): Promise<ShelvedBook | null> {
  const { data, error } = await supabase
    .from("books")
    .select(COLUMNS)
    .eq("id", bookId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** The caller's copy of an ISBN (13-digit form), if they have one. */
export async function findBookByIsbn(
  supabase: Client,
  isbn: string,
): Promise<ShelvedBook | null> {
  const { data, error } = await supabase
    .from("books")
    .select(COLUMNS)
    .eq("isbn", isbn)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createBook(
  supabase: Client,
  fields: BookFields,
): Promise<ShelvedBook> {
  const { data, error } = await supabase
    .from("books")
    .insert(fields)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateBook(
  supabase: Client,
  bookId: string,
  fields: BookFields,
): Promise<ShelvedBook> {
  const { data, error } = await supabase
    .from("books")
    .update(fields)
    .eq("id", bookId)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBook(
  supabase: Client,
  bookId: string,
): Promise<void> {
  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) throw error;
}
