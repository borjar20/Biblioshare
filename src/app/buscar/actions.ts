"use server";

import { redirect } from "next/navigation";
import { revalidateSearch } from "@/lib/reactivity/revalidate";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import { applyTransition } from "@/lib/passes/apply-transition";
import { ensureBookHydrated, bookShellFromSearchResult } from "@/lib/catalog/hydrate-book";
import { ensureMovieHydrated, ensureSeriesHydrated } from "@/lib/catalog/hydrate-screen";
import { itemHref } from "@/lib/catalog/item-href";
import { loginHref } from "@/lib/auth/safe-next";
import { settledWithin } from "@/lib/async/settled-within";
import type { SearchResult } from "@/lib/catalog/types";

// Presupuesto de la hidratación antes de navegar. No es un timeout de la
// llamada: es cuánto está dispuesto el usuario a mirar una pantalla congelada.
const HYDRATION_BUDGET_MS = 1200;

type Supa = Awaited<ReturnType<typeof createClient>>;

// Dispatcher común. El shell de libro (título/autor a null, work key e ISBN
// del propio `result`, y por qué eso es seguro) vive en
// `bookShellFromSearchResult` (hydrate-book.ts): ese fichero NO es "use
// server", así que el invariante de C1 tiene test unitario ahí — aquí, en un
// fichero "use server", cualquier export nuevo sería un endpoint público.
//
// m-4: `hydrated_at: null` para películas/series va fijo aquí porque
// `findOrCreateCatalogItem` puede CREAR la fila (shell sin hidratar, #674) o
// ENCONTRARLA por external_id ya existente (`register_catalog_item` es
// on-conflict-do-nothing con re-select) — en el camino *find* la fila puede
// llevar tiempo hidratada. Fijarlo en null aquí se salta su cooldown de 30
// días en ese caso. No hay riesgo de datos (la RPC es fill-or-upgrade y las
// propuestas salen de la work key de la propia fila; el ángulo de abuso ya
// está en #811), pero conviene saber que no es "recién creada", es "recién
// creada o encontrada". Ninguna de las tres ensure*Hydrated lanza.
function hydrateNewItem(supabase: Supa, itemId: string, result: SearchResult) {
  return result.itemType === "book"
    ? ensureBookHydrated(supabase, bookShellFromSearchResult(itemId, result))
    : result.itemType === "movie"
      ? ensureMovieHydrated(supabase, {
          id: itemId,
          tmdb_id: Number(result.externalId),
          hydrated_at: null,
        })
      : ensureSeriesHydrated(supabase, {
          id: itemId,
          tmdb_id: Number(result.externalId),
          hydrated_at: null,
        });
}

// Abrir la ficha de un resultado que TODAVÍA no está en el catálogo: la búsqueda
// ya no persiste nada (§7.32), así que un resultado de la API llega sin
// catalogId y no hay ficha a la que enlazar hasta que la obra existe. Aquí es
// donde nace: el usuario ha hecho clic, es decir, se ha comprometido con el
// libro. La hidratación se intenta aquí con un presupuesto corto y, si no llega
// a tiempo, se termina en segundo plano (ver HYDRATION_BUDGET_MS arriba).
export async function openCatalogItem(result: SearchResult) {
  if (result.catalogId) redirect(itemHref(result.itemType, result.catalogId));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Crear catálogo exige sesión (RLS). Un visitante anónimo solo puede abrir lo
  // que ya está cacheado; para lo demás, pasa por el login y vuelve a la
  // búsqueda tras entrar (el ítem aún no existe, así que no hay ficha a la que
  // devolverle; que reabra el resultado ya con sesión).
  if (!user) redirect(loginHref("/buscar"));

  const itemId = await findOrCreateCatalogItem(supabase, result, user.id);

  // La hidratación pega a una API externa (OpenLibrary o TMDB), y puede tardar
  // varios segundos: esperarla entera aquí dejaba el clic en el resultado
  // congelado, con la pantalla de búsqueda intacta y sin más aviso que la
  // tarjeta atenuada. Se le da un presupuesto corto: si el proveedor responde
  // rápido (lo normal), la ficha nace ya con sinopsis y géneros; si no, se
  // navega igual y el trabajo sigue vivo en after(), así que la ficha lo
  // tendrá en el siguiente pintado. La red de seguridad final es el curador de
  // la propia ficha (after() en libro|pelicula|serie/[id]/page.tsx), que
  // rehidrata cualquier fila con hydrated_at null la próxima vez que se abra.
  // Nunca lanza.
  const hydration = hydrateNewItem(supabase, itemId, result);
  if (!(await settledWithin(hydration, HYDRATION_BUDGET_MS))) {
    after(() => hydration);
  }

  redirect(itemHref(result.itemType, itemId));
}

export async function addToLibrary(result: SearchResult) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginHref("/buscar"));

  // La búsqueda ya NO persiste los resultados de la API (§7.32): un resultado
  // que no venía del catálogo local llega sin catalogId, y la fila nace aquí,
  // que es cuando el usuario se compromete con el ítem.
  const itemId =
    result.catalogId ?? (await findOrCreateCatalogItem(supabase, result, user.id));

  // Alta = pase activo en planned vía la máquina; si ya estaba en la
  // biblioteca (pase activo existente), la transición es un no-op.
  await applyTransition(supabase, user.id, result.itemType, itemId, "planned", undefined, { silent: true });

  // Solo si la fila se acaba de crear: a diferencia de openCatalogItem, aquí
  // no hay ficha que abrir después, así que no hay presupuesto que esperar —
  // todo va a after() para no alargar el alta. Sin esto, una obra añadida
  // desde "Para más tarde" sin abrir su ficha se quedaría con title NULL hasta
  // que alguien la abriera.
  if (!result.catalogId) {
    after(() => hydrateNewItem(supabase, itemId, result));
  }

  revalidateSearch();
}
