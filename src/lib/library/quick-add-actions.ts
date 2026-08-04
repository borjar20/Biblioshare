"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { applyTransition } from "@/lib/passes/apply-transition";
import { notifyAdded } from "@/lib/social/notify-followers";
import type { ItemType } from "@/lib/catalog/types";

// Alta rápida desde el feed: mete la obra en la cola (planned) reusando la
// máquina de estados. Idempotente — si ya hay pase activo, applyTransition es
// no-op; si devuelve askResume (re-alta tras cerrar un pase), se trata como
// éxito silencioso (la obra ya tiene historia; el usuario decide en su ficha).
export async function quickAddToLibrary(itemType: ItemType, itemId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const outcome = await applyTransition(supabase, user.id, itemType, itemId, "planned");
  await notifyAdded(supabase, user.id, outcome);
  revalidatePath("/");
}

// "Guardar los N en mi cola": UNA sola acción (un round-trip), transiciones en
// paralelo, un único revalidate al final — elegido sobre el bucle cliente por
// rendimiento (spec D4).
export async function quickAddManyToLibrary(
  items: { itemType: ItemType; itemId: string }[],
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await Promise.all(
    items.map((i) => applyTransition(supabase, user.id, i.itemType, i.itemId, "planned")),
  );
  revalidatePath("/");
}
