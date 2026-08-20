import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { ItemType, SearchResult } from "@/lib/catalog/types";
import { getPersonCombinedCredits } from "@/lib/catalog/tmdb";
import { fetchAuthorWorks } from "@/lib/catalog/openlibrary/author-books";
import { findOrCreateCatalogItemsBulk } from "@/lib/catalog/find-or-create";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type HydratablePerson = {
  id: string;
  name: string;
  tmdbId: number | null;
  openlibraryKey: string | null;
  creditsHydratedAt: string | null;
};

// Solo hidrata quien tiene a quién preguntar y no se ha hidratado ya. La marca
// es definitiva: no se re-consulta la API por persona hidratada. Traer la obra
// NUEVA de una persona ya hidratada es trabajo aparte (issue de deuda).
export function needsCreditHydration(person: HydratablePerson): boolean {
  if (person.creditsHydratedAt) return false;
  return person.tmdbId != null || Boolean(person.openlibraryKey);
}

type PendingCredit = {
  itemType: ItemType;
  externalId: string;
  role: string;
  character: string | null;
};

/**
 * Trae la obra COMPLETA de una persona desde su API externa y la persiste:
 * catálogo (en lote) + `credits` (un solo upsert) + la marca.
 *
 * Arregla el bug de fondo de la ficha: `credits` solo tenía lo que alguien
 * hubiera abierto alguna vez, así que una persona con una sola película en BD
 * afirmaba —sin matices— que esa era toda su obra.
 *
 * NUNCA lanza. Un fallo de API externa degrada la ficha a lo que ya hubiera en
 * BD; no la rompe. Mismo criterio que ensureItemEnriched y
 * populateTmdbCollection.
 */
export async function hydratePersonCredits(
  supabase: SupabaseServerClient,
  person: HydratablePerson
): Promise<void> {
  if (!needsCreditHydration(person)) return;

  try {
    const searchResults: SearchResult[] = [];
    const pending: PendingCredit[] = [];

    if (person.tmdbId != null) {
      for (const c of await getPersonCombinedCredits(person.tmdbId)) {
        searchResults.push({
          itemType: c.itemType,
          externalId: String(c.tmdbId),
          title: c.title,
          originalTitle: c.originalTitle,
          subtitle: null,
          coverUrl: c.coverUrl,
          year: c.year,
          synopsis: c.synopsis,
          genres: c.genres,
        } as SearchResult);
        pending.push({
          itemType: c.itemType,
          externalId: String(c.tmdbId),
          role: c.role,
          character: c.character,
        });
      }
    } else if (person.openlibraryKey) {
      for (const w of await fetchAuthorWorks(person.openlibraryKey)) {
        searchResults.push({
          itemType: "book",
          externalId: w.workKey,
          title: w.title,
          // `subtitle` acaba en `books.author`. Lo sabemos —es la persona cuya
          // ficha estamos hidratando—, y dejarlo a null haría nacer el libro sin
          // autor: la ficha lo mostraría vacío.
          subtitle: person.name,
          coverUrl: w.coverUrl,
          // El año viene de `first_publish_year`. Antes se escribía `null`
          // literal aquí, y de ahí salían los 83 libros sin año de Shusterman:
          // el endpoint viejo no lo daba y este sí.
          year: w.year,
          synopsis: null,
          genres: null,
        } as SearchResult);
        pending.push({
          itemType: "book",
          externalId: w.workKey,
          role: "author",
          character: null,
        });
      }
    }

    // La API no devolvió nada (o falló): NO se marca. Un fallo temporal de red
    // no debe condenar a esta persona a no hidratarse nunca.
    if (searchResults.length === 0) return;

    const idsByExternal = await findOrCreateCatalogItemsBulk(supabase, searchResults);

    // El anónimo no pudo escribir catálogo (42501): sin ids no hay créditos que
    // insertar ni marca que poner. La ficha se pinta igual desde lo que ya
    // hubiera en BD; persistirá el primer visitante con sesión.
    if (idsByExternal.size === 0) return;

    const rows = pending
      .map((p) => {
        const itemId = idsByExternal.get(`${p.itemType}:${p.externalId}`);
        if (!itemId) return null;
        return {
          item_type: p.itemType,
          item_id: itemId,
          person_id: person.id,
          role: p.role,
          character: p.character,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length > 0) {
      // UPSERT, no INSERT: `credits` tiene índice único sobre
      // (item_type, item_id, person_id, role), y el caso NORMAL es que alguna
      // de estas filas ya exista —la persona llegó a `people` justamente POR un
      // crédito que escribió ensureItemEnriched al abrir la ficha de una de sus
      // obras—. Con un insert plano, esa única fila repetida haría fallar el
      // lote ENTERO con 23505 y no se guardaría ninguna de las nuevas.
      // #725: con service_role. `credits` es catálogo global y su INSERT estaba
      // abierto a cualquier `authenticated` (`with check (true)`): se podía
      // colgar de una persona una filmografía inventada que veía todo el mundo.
      // Estas filas las deriva el SERVIDOR del proveedor; ninguna viene del
      // cliente. Ver la cabecera de `find-or-create-person.ts`.
      //
      // Efecto secundario buscado: **un visitante ANÓNIMO también hidrata**.
      // Antes su escritura moría con 42501 y la ficha se quedaba sin obra hasta
      // que pasara alguien con sesión. Ahora la hidratación ya no depende de
      // quién mire — que es justo lo que significa «catálogo compartido». Sigue
      // acotada por el guard de `credits_hydrated_at`: una vez por persona.
      const { error } = await createServiceRoleClient()
        .from("credits")
        .upsert(rows, {
          onConflict: "item_type,item_id,person_id,role",
          ignoreDuplicates: true,
        });
      // Se corta antes de marcar: marcar tras un fallo dejaría la persona sin
      // hidratar para siempre.
      if (error) {
        console.error("person credits upsert failed", {
          personId: person.id,
          count: rows.length,
          error,
        });
        return;
      }
    }

    const { error: markError } = await createServiceRoleClient()
      .from("people")
      .update({ credits_hydrated_at: new Date().toISOString() })
      .eq("id", person.id);
    if (markError) {
      console.error("credits_hydrated_at update failed", { personId: person.id, error: markError });
    }
  } catch (error) {
    console.error("hydratePersonCredits failed", { personId: person.id, error });
  }
}
