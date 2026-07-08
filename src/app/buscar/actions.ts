"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SearchResult } from "@/lib/catalog/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const TABLE_BY_TYPE = {
  book: "books",
  movie: "movies",
  series: "series",
} as const;

const ID_COLUMN_BY_TYPE = {
  book: "google_books_id",
  movie: "tmdb_id",
  series: "tmdb_id",
} as const;

async function findOrCreateCatalogItem(
  supabase: SupabaseServerClient,
  result: SearchResult
): Promise<string> {
  const table = TABLE_BY_TYPE[result.itemType];
  const idColumn = ID_COLUMN_BY_TYPE[result.itemType];
  const externalId =
    result.itemType === "book" ? result.externalId : Number(result.externalId);

  const { data: existing } = await supabase
    .from(table)
    .select("id")
    .eq(idColumn as never, externalId)
    .maybeSingle();
  if (existing) return existing.id;

  const payload =
    result.itemType === "book"
      ? {
          google_books_id: result.externalId,
          title: result.title,
          author: result.subtitle,
          cover_url: result.coverUrl,
          published_year: result.year,
          publisher: result.publisher,
          total_pages: result.pageCount,
        }
      : {
          tmdb_id: Number(result.externalId),
          title: result.title,
          cover_url: result.coverUrl,
          release_year: result.year,
        };

  // The insert shape differs per item type (picked above); this cast is the
  // single spot where the three catalog tables' insert types are reconciled.
  const { data: inserted, error } = await supabase
    .from(table)
    .insert(payload as never)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Race: another request inserted the same external id first.
      const { data: raceRow } = await supabase
        .from(table)
        .select("id")
        .eq(idColumn as never, externalId)
        .single();
      if (raceRow) return raceRow.id;
    }
    throw error;
  }

  return inserted.id;
}

export async function addToLibrary(result: SearchResult) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const itemId = await findOrCreateCatalogItem(supabase, result);

  const { error } = await supabase.from("library_entries").insert({
    user_id: user.id,
    item_type: result.itemType,
    item_id: itemId,
  });

  // Ignore "already in your library" conflicts; anything else is a real error.
  if (error && error.code !== "23505") {
    throw error;
  }

  revalidatePath("/buscar");
}
