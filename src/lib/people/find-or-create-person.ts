import type { createClient } from "@/lib/supabase/server";
import { resolveOpenLibraryAuthor } from "@/lib/catalog/open-library";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Resuelve (creando si hace falta) las filas de `people` para un lote de
// personas de TMDB, devolviendo un mapa tmdbId → people.id. Patrón por lotes
// para no hacer un select+insert por cada miembro del reparto. Ver §7.34.
export async function findOrCreatePeopleByTmdb(
  supabase: SupabaseServerClient,
  persons: Array<{ tmdbId: number; name: string; photoUrl: string | null }>
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (persons.length === 0) return map;

  const byTmdb = new Map<number, { tmdbId: number; name: string; photoUrl: string | null }>();
  for (const p of persons) if (!byTmdb.has(p.tmdbId)) byTmdb.set(p.tmdbId, p);
  const ids = [...byTmdb.keys()];

  const { data: existing, error: existingError } = await supabase
    .from("people")
    .select("id, tmdb_id")
    .in("tmdb_id", ids);
  if (existingError) console.error("people select failed", existingError);
  for (const row of existing ?? []) {
    if (row.tmdb_id != null) map.set(row.tmdb_id, row.id);
  }

  const toInsert = [...byTmdb.values()].filter((p) => !map.has(p.tmdbId));
  if (toInsert.length > 0) {
    // Construir el mapa desde las filas devueltas por el propio insert (evita un
    // re-select posterior). En caso de carrera (índice único parcial sobre
    // tmdb_id) el insert falla en bloque; se recupera re-seleccionando.
    const { data: inserted, error: insertError } = await supabase
      .from("people")
      .insert(
        toInsert.map((p) => ({
          tmdb_id: p.tmdbId,
          name: p.name,
          photo_url: p.photoUrl,
        }))
      )
      .select("id, tmdb_id");

    if (insertError) {
      // 23505 = otra request insertó las mismas personas a la vez (el primer
      // render de la ficha dispara enriquecimientos concurrentes); esperado. Se
      // recuperan los ids re-seleccionando.
      if (insertError.code !== "23505") {
        console.error("people insert failed", insertError);
      }
      const { data: raced } = await supabase
        .from("people")
        .select("id, tmdb_id")
        .in("tmdb_id", ids);
      for (const row of raced ?? []) {
        if (row.tmdb_id != null) map.set(row.tmdb_id, row.id);
      }
    } else {
      for (const row of inserted ?? []) {
        if (row.tmdb_id != null) map.set(row.tmdb_id, row.id);
      }
    }
  }

  return map;
}

// Autores de libro: los identifica por nombre (tmdb_id null los distingue de las
// personas de cine). En el primer alta resuelve Open Library para enriquecer
// bio/foto; si no hay match, deja una ficha ligera (solo nombre). Ver §7.34.
export async function findOrCreateBookAuthor(
  supabase: SupabaseServerClient,
  name: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("people")
    .select("id")
    .eq("name", name)
    .is("tmdb_id", null)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const ol = await resolveOpenLibraryAuthor(name);

  const { data: inserted, error } = await supabase
    .from("people")
    .insert({
      name,
      openlibrary_key: ol?.key ?? null,
      photo_url: ol?.photoUrl ?? null,
      bio: ol?.bio ?? null,
      birth_date: ol?.birthDate ?? null,
      death_date: ol?.deathDate ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // Carrera (índice único sobre openlibrary_key): otra request lo insertó ya.
    const { data: raced } = await supabase
      .from("people")
      .select("id")
      .eq("name", name)
      .is("tmdb_id", null)
      .limit(1)
      .maybeSingle();
    if (raced) return raced.id;
    throw error;
  }

  return inserted.id;
}
