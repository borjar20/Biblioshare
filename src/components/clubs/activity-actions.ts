"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { searchCatalog } from "@/lib/catalog/search";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import type { SearchResult } from "@/lib/catalog/types";
import type { LibraryItem } from "@/lib/library/types";
import type { ItemType } from "@/lib/catalog/types";

// getLibraryItems() ya soporta search/itemType server-side -- se reutiliza tal cual,
// envuelta en una server action ("use server") ya que la función en sí no lo es (toma un
// cliente Supabase ya creado, se llama desde componentes de servidor). Mismo patrón que
// loadOwnRecentActivity en club-post-actions.ts (Bloque F).
export async function loadMyLibraryItems(search?: string, itemType?: ItemType): Promise<LibraryItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return getLibraryItems(supabase, user.id, { search, itemType });
}

// Búsqueda de catálogo general para el picker de actividades: mismo flujo
// DB-first/cache-as-you-go que /buscar (§7.32). Se exige sesión: así el cacheo
// oportunista de searchCatalog puede insertar (RLS de books/movies/series
// permite INSERT a authenticated) y los resultados llegan con catalogId.
export async function searchCatalogItems(itemType: ItemType, query: string): Promise<SearchResult[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return searchCatalog(itemType, query);
}

// Garantiza el uuid LOCAL de un resultado de búsqueda antes de usarlo en un
// pool de actividad: club_activity_items no tiene FK al catálogo, pero
// getActivity descarta cualquier ítem cuyo uuid no exista en books/movies/
// series -- añadir un externalId sin cachear lo haría invisible.
export async function resolveCatalogItem(result: SearchResult): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return findOrCreateCatalogItem(supabase, result);
}
