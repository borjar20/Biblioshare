"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { applyTransition } from "@/lib/passes/apply-transition";
import { revalidateItemPage } from "@/lib/reactivity/revalidate";

// Unlike addToLibrary in src/app/buscar/actions.ts, the item here already has
// a catalog row (we're on its detail page) — no findOrCreate step needed.
// queueId optionally drops it straight into a named queue (§7.22).
//
// "Seguir" = crear el pase activo en planned vía la máquina (applyTransition):
// si ya había pase activo, la transición es un no-op (idempotente, el 23505
// de antes). El disparador vive en el hero (HeroStatusOrFollow) y en el rail de
// PC (ItemRailActions), ambos vía el hook useFollow. Ya no se pregunta la
// edición al seguir: se difiere al empezar a leer (panel Progreso), así que este
// alta no arrastra ninguna elección de edición.
export async function addExistingItemToLibrary(
  itemType: ItemType,
  itemId: string,
  queueId?: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await applyTransition(supabase, user.id, itemType, itemId, "planned");

  // La cola solo significa algo en el pase activo planned: se aplica después
  // del alta, misma semántica que moveEntryToQueue (§7.22).
  if (queueId) {
    const { error } = await supabase
      .from("passes")
      .update({ queue_id: queueId, queue_order: null })
      .eq("user_id", user.id)
      .eq("item_type", itemType)
      .eq("item_id", itemId)
      .eq("is_active", true)
      .eq("status", "planned");
    if (error) throw error;
  }

  revalidateItemPage(itemType, itemId);
}
