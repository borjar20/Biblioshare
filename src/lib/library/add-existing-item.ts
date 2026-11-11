"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { applyTransition } from "@/lib/passes/apply-transition";
import { revalidateItemPage, revalidateLibrary } from "@/lib/reactivity/revalidate";

// Unlike addToLibrary in src/app/buscar/actions.ts, the item here already has
// a catalog row (we're on its detail page) — no findOrCreate step needed.
//
// Añadir la obra = crear el pase activo en planned vía la máquina
// (applyTransition): si ya había pase activo, la transición es un no-op
// (idempotente, el 23505 de antes). Lo dispara cualquiera de las intenciones de
// la tarjeta del hero («Quiero leerlo», «Lo estoy leyendo», «Ya lo leí»; spec
// 2026-11-10-ficha-acciones) vía PassActionsProvider.addWith, que para las dos
// últimas encadena después un updateStatus. No se pregunta la edición al
// añadir: se difiere al empezar a leer (panel Progreso), así que este alta no
// arrastra ninguna elección de edición.
export async function addExistingItemToLibrary(
  itemType: ItemType,
  itemId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await applyTransition(supabase, user.id, itemType, itemId, "planned", undefined, { silent: true });

  revalidateItemPage(itemType, itemId);
  // Añadir mete la obra en la biblioteca, así que /coleccion también cambia.
  // Faltaba (issue #106): este módulo existe justamente para que "olvidar una
  // ruta" no sea posible, y esta se había olvidado.
  revalidateLibrary();
}
