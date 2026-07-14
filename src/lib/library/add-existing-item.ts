"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";

// Unlike addToLibrary in src/app/buscar/actions.ts, the item here already has
// a catalog row (we're on its detail page) — no findOrCreate step needed.
// queueId optionally drops it straight into a named queue (§7.22).
//
// La edición elegida AL SEGUIR (Tarea 3) YA NO viaja por aquí (Hallazgo 3 de
// la revisión final): "seguir" siempre crea la entrada en "planned", nunca
// abre un pase de entrada, así que un parámetro editionId en esta acción no
// tendría ninguna rama donde aplicarse — era código muerto que hacía creer al
// usuario que su elección se guardaba cuando en realidad se tiraba. La
// elección real se guarda en localStorage (ver FollowButton en
// log-panel.tsx / editionChoiceStorageKey en
// src/lib/passes/edition-choice.ts) y se aplica sola con setPassEdition en
// cuanto se abre el primer pase del ítem.
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

  const { error } = await supabase.from("library_entries").insert({
    user_id: user.id,
    item_type: itemType,
    item_id: itemId,
    ...(queueId && { queue_id: queueId }),
  });

  // Ignore "already in your library" conflicts; anything else is a real error.
  if (error && error.code !== "23505") {
    throw error;
  }

  revalidatePath(itemHref(itemType, itemId));
}
