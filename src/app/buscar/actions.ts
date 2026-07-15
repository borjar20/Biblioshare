"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import { applyTransition } from "@/lib/passes/apply-transition";
import { ensureBookHydrated } from "@/lib/catalog/hydrate-book";
import { itemHref } from "@/lib/catalog/item-href";
import type { SearchResult } from "@/lib/catalog/types";

// Abrir la ficha de un resultado que TODAVÍA no está en el catálogo: la búsqueda
// ya no persiste nada (§7.32), así que un resultado de la API llega sin
// catalogId y no hay ficha a la que enlazar hasta que la obra existe. Aquí es
// donde nace: el usuario ha hecho clic, es decir, se ha comprometido con el
// libro. Al abrirla, la ficha la hidrata (ensureBookHydrated).
export async function openCatalogItem(result: SearchResult) {
  if (result.catalogId) redirect(itemHref(result.itemType, result.catalogId));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Crear catálogo exige sesión (RLS). Un visitante anónimo solo puede abrir lo
  // que ya está cacheado; para lo demás, pasa por el login.
  if (!user) redirect("/login");

  const itemId = await findOrCreateCatalogItem(supabase, result, user.id);

  // Se hidrata AQUÍ, antes de redirigir, y no en la ficha: el usuario ya está
  // esperando la navegación, así que la llamada a OpenLibrary se paga en un
  // momento en el que no se nota, y la ficha aparece con su sinopsis a la
  // primera en lugar de vacía hasta la siguiente visita. Nunca lanza.
  if (result.itemType === "book") {
    await ensureBookHydrated(supabase, {
      id: itemId,
      openlibrary_work_key: result.externalId,
      isbn: result.matchedIsbn ?? null,
      hydrated_at: null,
    });
  }

  redirect(itemHref(result.itemType, itemId));
}

// queueId drops the new (planned) item straight into a named queue (§7.22);
// null/undefined leaves it in the "Sin cola" bucket. A foreign queue id is
// rejected by the FK + queues RLS and surfaces as a normal error, so there's
// no need to re-check ownership here.
export async function addToLibrary(result: SearchResult, queueId?: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // La búsqueda ya NO persiste los resultados de la API (§7.32): un resultado
  // que no venía del catálogo local llega sin catalogId, y la fila nace aquí,
  // que es cuando el usuario se compromete con el ítem.
  const itemId =
    result.catalogId ?? (await findOrCreateCatalogItem(supabase, result, user.id));

  // Alta = pase activo en planned vía la máquina; si ya estaba en la
  // biblioteca (pase activo existente), la transición es un no-op.
  await applyTransition(supabase, user.id, result.itemType, itemId, "planned");

  // La cola solo significa algo en el pase activo planned (§7.22).
  if (queueId) {
    const { error } = await supabase
      .from("diary_entries")
      .update({ queue_id: queueId, queue_order: null })
      .eq("user_id", user.id)
      .eq("item_type", result.itemType)
      .eq("item_id", itemId)
      .eq("is_active", true)
      .eq("status", "planned");
    if (error) throw error;
  }

  revalidatePath("/buscar");
}
