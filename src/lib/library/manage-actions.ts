"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import {
  applyTransition,
  type TransitionOutcome,
} from "@/lib/passes/apply-transition";
import type { MediaStatus } from "./types";
import { revalidateReadingLog, revalidateLibrary } from "@/lib/reactivity/revalidate";

// Todo cambio de estado pasa por la máquina (planTransition) vía
// applyTransition: nadie más escribe `status`. El resultado vuelve al
// cliente para que abra la hoja de retomar (askResume) o encadene la de
// cierre (done + closed).
export async function updateStatus(
  itemType: ItemType,
  itemId: string,
  status: MediaStatus,
  resume?: "continue" | "restart"
): Promise<TransitionOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const outcome = await applyTransition(supabase, user.id, itemType, itemId, status, resume);
  if (outcome.kind === "done") revalidateReadingLog(itemType, itemId);
  return outcome;
}

// Quitar de la biblioteca = borrar TODOS los pases de la obra (la
// confirmación vive en la UI, como hasta ahora). Las sesiones caen en
// cascada (progress_sessions.pass_id); los episodios vistos sobreviven con
// pass_id a null (FK set null, 20260717_pass_hub_b3).
export async function removeFromLibrary(itemType: ItemType, itemId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("passes")
    .delete()
    .eq("user_id", user.id)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) throw error;
  revalidateReadingLog(itemType, itemId);
}

// Moves a planned item into a named queue (or the "Sin cola" bucket when
// queueId is null) from the item detail page (§7.22). Opera sobre el pase
// activo planned: la cola solo significa algo ahí. queue_order is reset to
// null so ensureQueueOrder appends it to the end of the target queue on the
// next /cola visit. A foreign queue id is rejected by the FK + queues RLS.
export async function moveEntryToQueue(
  itemType: ItemType,
  itemId: string,
  queueId: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("passes")
    .update({ queue_id: queueId, queue_order: null })
    .eq("user_id", user.id)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .eq("is_active", true)
    .eq("status", "planned");
  if (error) throw error;
  revalidateReadingLog(itemType, itemId);
  revalidateLibrary();
}
