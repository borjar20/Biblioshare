import type { createClient } from "@/lib/supabase/server";
import { getPersonDetails } from "@/lib/catalog/tmdb";
import type { Person } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Las columnas de `people` que necesita la ficha, en UN solo sitio:
// getPersonProfile lee exactamente esto y no puede divergir.
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

