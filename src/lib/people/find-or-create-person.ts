import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { fetchOpenLibraryAuthorByKey } from "@/lib/catalog/openlibrary/work-authors";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// #725: las ALTAS en `people` van con service_role, no con el cliente de la
// petición. `people` es catálogo global y su INSERT estaba abierto de par en par
// (`with check (true)` para cualquier `authenticated`): se podían crear personas
// inventadas que veía todo el mundo. Las filas que se escriben aquí las deriva
// el SERVIDOR del proveedor —TMDB por `tmdb_id`, Open Library por
// `openlibrary_key`— y ni un campo viene del cliente, así que el hecho lo
// respalda el servidor. Mismo argumento y mismo patrón que las sagas TMDB
// (`src/lib/sagas/persist-collection.ts`).
//
// Las LECTURAS se quedan con el cliente de la petición: el catálogo es público y
// no hace falta saltarse la RLS para consultarlo.

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
    const { data: inserted, error: insertError } = await createServiceRoleClient()
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

// Autores de libro: los identifica por su CLAVE de Open Library, nunca por el
// nombre. El nombre no es identidad —"Fiódor Dostoyevski" y "Fyodor Dostoevsky"
// son el mismo humano, y "Frank Herbert" son dos personas distintas en OL— y
// buscarlo era el origen de las fichas falsas y de una fila por idioma.
//
// `tmdb_id` nulo sigue distinguiendo a los autores de las personas de cine.
//
// Devuelve `null`, nunca lanza: si el autor no se puede resolver, el libro se
// queda sin crédito y su ficha enseña `books.author` como texto plano. Es
// preferible a inventarse a alguien.
export async function findOrCreateBookAuthorByKey(
  supabase: SupabaseServerClient,
  key: string
): Promise<string | null> {
  const authorKey = (key ?? "").trim().replace(/^\/?authors\//, "");
  if (!authorKey) return null;

  const { data: existing } = await supabase
    .from("people")
    .select("id")
    .eq("openlibrary_key", authorKey)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const ol = await fetchOpenLibraryAuthorByKey(authorKey);
  // Sin ficha, o sin ninguna grafía latina: no se crea la persona.
  if (!ol) return null;

  const { data: inserted, error } = await createServiceRoleClient()
    .from("people")
    .insert({
      name: ol.name,
      aliases: ol.aliases,
      openlibrary_key: ol.key,
      photo_url: ol.photoUrl,
      bio: ol.bio,
      birth_date: ol.birthDate,
      death_date: ol.deathDate,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = otra request lo insertó a la vez (índice único parcial
    // `people_openlibrary_key_key`). Se recupera re-seleccionando POR CLAVE —
    // por nombre NO funcionaba, y ese era justo el bug que dejaba el libro sin
    // ningún crédito.
    const { data: raced } = await supabase
      .from("people")
      .select("id")
      .eq("openlibrary_key", authorKey)
      .limit(1)
      .maybeSingle();
    if (raced) return raced.id;

    // 42501 = visitante anónimo sin grant de escritura; esperado, no se
    // registra. Cualquier otro sí.
    if (error.code !== "42501" && error.code !== "23505") {
      console.error("people insert failed", { authorKey, error });
    }
    return null;
  }

  return inserted.id;
}
