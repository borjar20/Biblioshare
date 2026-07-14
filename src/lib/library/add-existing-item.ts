"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { openPass } from "@/lib/passes/actions";

// Unlike addToLibrary in src/app/buscar/actions.ts, the item here already has
// a catalog row (we're on its detail page) — no findOrCreate step needed.
// queueId optionally drops it straight into a named queue (§7.22).
//
// editionId (Tarea 3) es la edición que el usuario dijo tener AL SEGUIR, antes
// de que exista ningún pase donde guardarla. No hay
// library_entries.preferred_edition_id (decisión explícita: la edición es del
// PASE, no de la entrada, y un segundo sitio donde vive lo mismo es la
// duplicidad que este rediseño vino a quitar) — así que la única forma de
// aplicar la elección es abrir el pase ya con esa edición, y solo tiene
// sentido hacerlo si el alta abre un pase de una (status "in_progress"; hoy
// "seguir" siempre crea con el status por defecto "planned", así que en la
// práctica esta rama todavía no se ejecuta, pero deja el contrato listo para
// cuando exista un alta que sí empiece en_curso). Si el alta queda
// "pendiente", la elección se descarta sin más: se volverá a preguntar cuando
// el usuario empiece a leer (ver ManagedLog en log-panel.tsx).
export async function addExistingItemToLibrary(
  itemType: ItemType,
  itemId: string,
  queueId?: string | null,
  editionId?: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: newEntry, error } = await supabase
    .from("library_entries")
    .insert({
      user_id: user.id,
      item_type: itemType,
      item_id: itemId,
      ...(queueId && { queue_id: queueId }),
    })
    .select("id, status")
    .maybeSingle();

  // Ignore "already in your library" conflicts; anything else is a real error.
  if (error && error.code !== "23505") {
    throw error;
  }

  if (editionId && newEntry?.status === "in_progress") {
    // openPass valida por su cuenta (RLS + el trigger de
    // 20260714_passes_integrity.sql) que la edición pertenece a este ítem: no
    // hace falta repetir esa comprobación aquí.
    await openPass(newEntry.id, editionId);
  }

  revalidatePath(itemHref(itemType, itemId));
}
