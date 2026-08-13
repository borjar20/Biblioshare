import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getPersonDetails } from "@/lib/catalog/tmdb";
import type { CreditRole, Person, PersonWork } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Las columnas de `people` que necesita la ficha, en UN solo sitio: getPerson y
// getPersonProfile leen exactamente lo mismo y no pueden divergir.
export const PERSON_COLUMNS =
  "id, name, tmdb_id, openlibrary_key, photo_url, bio, birth_date, death_date, place_of_birth, credits_hydrated_at";

export type PersonRow = {
  id: string;
  name: string;
  tmdb_id: number | null;
  openlibrary_key: string | null;
  photo_url: string | null;
  bio: string | null;
  birth_date: string | null;
  death_date: string | null;
  place_of_birth: string | null;
  credits_hydrated_at: string | null;
};

const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books",
  movie: "movies",
  series: "series",
};

export function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    photoUrl: row.photo_url,
    bio: row.bio,
    birthDate: row.birth_date,
    deathDate: row.death_date,
    placeOfBirth: row.place_of_birth,
  };
}

// Enriquece bio/foto/fechas de una persona de TMDB la primera vez que se abre su
// ficha (los créditos solo guardan nombre+foto). Nunca lanza. Ver §7.34.
export async function enrichTmdbBio(
  supabase: SupabaseServerClient,
  row: PersonRow
): Promise<PersonRow> {
  if (row.bio || !row.tmdb_id) return row;
  try {
    const details = await getPersonDetails(row.tmdb_id);
    if (!details) return row;
    const { data: updated } = await supabase
      .from("people")
      .update({
        bio: details.bio ?? row.bio,
        photo_url: row.photo_url ?? details.photoUrl,
        birth_date: details.birthDate ?? row.birth_date,
        death_date: details.deathDate ?? row.death_date,
        place_of_birth: details.placeOfBirth ?? row.place_of_birth,
      })
      .eq("id", row.id)
      // `credits_hydrated_at` entra en el SELECT (lectura abierta) pero NUNCA en
      // el objeto del UPDATE de arriba: ese sigue tocando solo las cinco
      // columnas de biografía.
      .select(PERSON_COLUMNS)
      .maybeSingle();
    return (updated as PersonRow) ?? row;
  } catch (error) {
    console.error("enrichTmdbBio failed", { id: row.id, error });
    return row;
  }
}

async function resolveWorks(
  supabase: SupabaseServerClient,
  credits: Array<{ item_type: ItemType; item_id: string; role: string; character: string | null }>
): Promise<PersonWork[]> {
  // Agrupar ids por tipo para resolver título/portada en lote.
  const byType: Record<ItemType, Set<string>> = { book: new Set(), movie: new Set(), series: new Set() };
  for (const c of credits) byType[c.item_type].add(c.item_id);

  const titles = new Map<string, { title: string; coverUrl: string | null }>();
  await Promise.all(
    (Object.keys(byType) as ItemType[]).map(async (type) => {
      const ids = [...byType[type]];
      if (ids.length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type])
        .select("id, title, cover_url")
        .in("id", ids);
      for (const row of data ?? []) {
        titles.set(`${type}:${row.id}`, { title: row.title, coverUrl: row.cover_url });
      }
    })
  );

  const works: PersonWork[] = [];
  const seen = new Set<string>();
  for (const c of credits) {
    const key = `${c.item_type}:${c.item_id}`;
    if (seen.has(key)) continue; // una fila por ítem aunque tenga varios roles
    seen.add(key);
    const meta = titles.get(key);
    if (!meta) continue;
    works.push({
      itemType: c.item_type,
      itemId: c.item_id,
      title: meta.title,
      coverUrl: meta.coverUrl,
      href: itemHref(c.item_type, c.item_id),
      role: c.role as CreditRole,
      character: c.character,
    });
  }
  return works.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getPerson(
  supabase: SupabaseServerClient,
  id: string
): Promise<{ person: Person; works: PersonWork[] } | null> {
  const { data: row } = await supabase
    .from("people")
    .select(PERSON_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;

  const enriched = await enrichTmdbBio(supabase, row as PersonRow);

  const { data: credits } = await supabase
    .from("credits")
    .select("item_type, item_id, role, character")
    .eq("person_id", id);

  const works = await resolveWorks(
    supabase,
    (credits ?? []) as Array<{
      item_type: ItemType;
      item_id: string;
      role: string;
      character: string | null;
    }>
  );

  return { person: toPerson(enriched), works };
}
