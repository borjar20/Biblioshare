"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { revalidateItemPage, revalidateSagaPage } from "@/lib/reactivity/revalidate";

export type AssignSagaState = {
  error?: "nameRequired" | "forbidden" | "generic";
};

// Asigna un ítem a una saga curada a mano (caso de libros: no hay fuente fiable
// de sagas literarias). Reutiliza una saga manual existente con el mismo nombre
// para que varios libros compartan saga. Multi-saga (spec §1.2): un ítem puede
// estar en varias sagas a la vez, así que ya no se limpia la membresía previa.
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

  // Multi-saga (spec §1.2): añadir sin tocar las membresías previas. Upsert
  // por si el ítem ya estaba en ESTA saga (actualiza la posición). Primary solo
  // si el ítem no tenía ninguna. `.neq("saga_id", sagaId)` excluye la propia
  // saga destino: si el ítem ya era primary AQUÍ (p. ej. se reenvía el
  // formulario solo para corregir la posición), no debe contar como "ya tiene
  // primary en otro sitio" — si contara, `is_primary: !primaryRow` la
  // des-primariaría en el propio upsert.
  const { data: primaryRow } = await supabase
    .from("saga_items")
    .select("saga_id")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .eq("is_primary", true)
    .neq("saga_id", sagaId)
    .maybeSingle();

  // El upsert reemplaza la fila entera, así que hay que releer el role y
  // reenviarlo: este formulario no lo edita, y sin esto un re-submit para
  // corregir la posición borraría el rol curado. Es el mismo modo de fallo que
  // documenta hydrate-route-draft.ts:11-22 con las notas de itinerario.
  const { data: existingItem } = await supabase
    .from("saga_items")
    .select("role")
    .eq("saga_id", sagaId)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .maybeSingle();

  const { error: insertError } = await supabase.from("saga_items").upsert(
    {
      saga_id: sagaId,
      item_type: itemType,
      item_id: itemId,
      position,
      role: existingItem?.role ?? null,
      is_primary: !primaryRow,
    },
    { onConflict: "saga_id,item_type,item_id" }
  );
  if (insertError) return { error: "generic" };

  revalidateItemPage(itemType, itemId);
  revalidateSagaPage(sagaId);
  return {};
}

// Quita el ítem de UNA saga (la indicada por `sagaId`), no de todas: en el
// modelo multi-saga (spec §1.2) un ítem puede tener varias membresías a la
// vez, y el aspa de la chip solo representa la que el colaborador tiene
// delante. Sin el filtro por saga_id, quitar la chip de una saga borraba de
// paso las demás membresías del ítem.
//
// Si la membresía borrada era la primary, el ítem puede quedarse sin
// ninguna primary (no se re-promociona automáticamente aquí: es decisión de
// fase 3, del editor completo de sagas). getItemSagas ya contempla ese caso
// y cae a `created_at` como desempate cuando no hay is_primary.
export async function removeItemFromSaga(itemType: ItemType, itemId: string, sagaId: string) {
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
    .eq("item_id", itemId)
    .eq("saga_id", sagaId);
  if (error) throw error;

  revalidateItemPage(itemType, itemId);
  revalidateSagaPage(sagaId);
}
