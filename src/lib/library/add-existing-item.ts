"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { applyTransition } from "@/lib/passes/apply-transition";
import { notifyAdded } from "@/lib/social/notify-followers";
import { revalidateItemPage, revalidateLibrary } from "@/lib/reactivity/revalidate";

// Unlike addToLibrary in src/app/buscar/actions.ts, the item here already has
// a catalog row (we're on its detail page) — no findOrCreate step needed.
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
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const outcome = await applyTransition(supabase, user.id, itemType, itemId, "planned");
  await notifyAdded(supabase, user.id, outcome);

  revalidateItemPage(itemType, itemId);
  // Seguir mete la obra en la biblioteca, así que /coleccion también cambia.
  // Faltaba (issue #106): este módulo existe justamente para que "olvidar una
  // ruta" no sea posible, y esta se había olvidado.
  revalidateLibrary();
}
