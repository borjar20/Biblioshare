"use server";

import { redirect } from "next/navigation";
import { revalidateAppChrome, revalidateOnboarding } from "@/lib/reactivity/revalidate";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { addExistingItemToLibrary } from "@/lib/library/add-existing-item";

const VALID: ItemType[] = ["book", "movie", "series"];

export async function saveInterests(interests: ItemType[]): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Se filtra contra la lista buena: los valores llegan del cliente y van a una
  // columna de enum, donde un valor inválido reventaría el update entero.
  const clean = interests.filter((i) => VALID.includes(i));

  await supabase
    .from("profiles")
    .update({ interests: clean.length > 0 ? clean : null })
    .eq("user_id", user.id);

  revalidateOnboarding();
}

/**
 * Añade o quita un título de la biblioteca desde la rejilla del paso 2.
 * El alta reutiliza addExistingItemToLibrary (idempotente); la baja borra el
 * pase planificado que acaba de crear, sin tocar pases con historia.
 */
export async function toggleTitle(
  itemType: ItemType,
  itemId: string,
  selected: boolean,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (selected) {
    await addExistingItemToLibrary(itemType, itemId);
  } else {
    // Solo se retira lo que este mismo paso pudo crear: un pase en planned. Si
    // el usuario ya tenía historia con la obra, no se toca.
    await supabase
      .from("passes")
      .delete()
      .eq("user_id", user.id)
      .eq("item_type", itemType)
      .eq("item_id", itemId)
      .eq("status", "planned");
  }

  revalidateOnboarding();
}

export async function finishOnboarding(): Promise<never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("user_id", user.id);

  // La home cambia de golpe (deja de estar vacía): hay que revalidarla.
  revalidateAppChrome();
  redirect("/");
}
