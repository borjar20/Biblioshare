"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref, sagaHref } from "@/lib/catalog/item-href";

export type AssignSagaState = {
  error?: "nameRequired" | "forbidden" | "generic";
};

// Asigna un ítem a una saga curada a mano (caso de libros: no hay fuente fiable
// de sagas literarias). Reutiliza una saga manual existente con el mismo nombre
// para que varios libros compartan saga. Un ítem está en una sola saga a la vez
// (la chip usa maybeSingle), así que se limpia la membresía previa primero.
export async function assignItemToSaga(
  itemType: ItemType,
  itemId: string,
  _prevState: AssignSagaState,
  formData: FormData
): Promise<AssignSagaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Curar sagas es contribución manual → colaborador+ (§7.35).
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) {
    return { error: "forbidden" };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "nameRequired" };

  const positionRaw = String(formData.get("position") ?? "").trim();
  let position: number | null = null;
  if (positionRaw) {
    const parsed = Number(positionRaw);
    if (Number.isInteger(parsed) && parsed > 0) position = parsed;
  }

  // Reutilizar una saga manual homónima (case-insensitive) o crearla.
  let sagaId: string | undefined;
  const { data: existing } = await supabase
    .from("sagas")
    .select("id")
    .eq("source", "manual")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (existing) {
    sagaId = existing.id;
  } else {
    const { data: inserted, error } = await supabase
      .from("sagas")
      .insert({ name, source: "manual" })
      .select("id")
      .single();
    if (error) return { error: "generic" };
    sagaId = inserted.id;
  }

  if (!sagaId) return { error: "generic" };

  // Un ítem, una saga: limpiar membresía previa y (re)insertar.
  await supabase
    .from("saga_items")
    .delete()
    .eq("item_type", itemType)
    .eq("item_id", itemId);

  const { error: insertError } = await supabase
    .from("saga_items")
    .insert({ saga_id: sagaId, item_type: itemType, item_id: itemId, position });
  if (insertError) return { error: "generic" };

  revalidatePath(itemHref(itemType, itemId));
  revalidatePath(sagaHref(sagaId));
  return {};
}

export async function removeItemFromSaga(itemType: ItemType, itemId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) {
    redirect(itemHref(itemType, itemId));
  }

  const { error } = await supabase
    .from("saga_items")
    .delete()
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) throw error;

  revalidatePath(itemHref(itemType, itemId));
}
