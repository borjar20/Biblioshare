"use server";

import { redirect } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import { revalidateSagaPage } from "@/lib/reactivity/revalidate";
import { createClient } from "@/lib/supabase/server";

// Saltar una opcional, deshacerlo, y el interruptor global (fase 4). Las tres
// clonan `adoptRoute` (route-actions.ts): RLS solo-dueño y SIN gate de rol,
// porque son preferencia personal, no curación — un lector cualquiera puede
// saltarse una opcional en una saga que él no cura.
//
// LO QUE NO HACEN: tocar el progreso. Saltar es solo visual. El denominador lo
// gobierna `countedKeys` (./progress.ts) desde `saga_items.optional`, y esta
// feature no lo mira siquiera. Es el límite duro de la spec 2026-07-28:
// reabrir el denominador es la familia de fallo del #91 y el #185.
//
// Los dos primeros argumentos son sagas DISTINTAS y no se pueden intercambiar:
//   · `ownerSagaId` es lo que se GUARDA — la saga dueña de la fila de
//     `saga_items` (`DetailMember.ownerSagaId`), para que el salto se vea igual
//     desde la ficha del universo y desde la de la subsaga.
//   · `sagaId` es solo la ficha que hay que revalidar, la que el lector está
//     mirando al pulsar.
// Desde la ficha de un universo, la mayoría de obras pertenecen a una subsaga y
// los dos valores no coinciden.

export async function skipOptional(
  sagaId: string,
  ownerSagaId: string,
  itemType: ItemType,
  itemId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // upsert y no insert: pulsar dos veces —doble submit, pestaña duplicada— no
  // puede acabar en un 23505 en la cara del lector.
  await supabase.from("saga_optional_skips").upsert(
    { user_id: user.id, saga_id: ownerSagaId, item_type: itemType, item_id: itemId },
    { onConflict: "user_id,saga_id,item_type,item_id" },
  );
  revalidateSagaPage(sagaId);
}

export async function unskipOptional(
  sagaId: string,
  ownerSagaId: string,
  itemType: ItemType,
  itemId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("saga_optional_skips")
    .delete()
    .eq("user_id", user.id)
    .eq("saga_id", ownerSagaId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  revalidateSagaPage(sagaId);
}

// Preferencia GLOBAL (spec §6): vale para todas las sagas, como
// `daily_goal_minutes`. `sagaId` solo dice qué ficha revalidar — la que el
// lector está mirando al pulsar. Las demás quedan bien solas al visitarlas,
// porque leen el perfil en `getSagaDetail`.
export async function setShowOptionalReadings(value: boolean, sagaId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("profiles").update({ show_optional_readings: value }).eq("user_id", user.id);
  revalidateSagaPage(sagaId);
}
