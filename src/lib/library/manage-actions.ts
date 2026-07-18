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
// cascada (progress_sessions.pass_id).
//
// Para series, borramos primero episode_watches (por user_id + series_id,
// esa tabla no tiene item_type/item_id). Si no lo hiciéramos, la FK set null
// (20260717_pass_hub_b3) desengancharía las filas de los pases borrados, y
// una serie REVISIONADA (mismo episodio marcado bajo dos pass_id distintos —
// lo permite el único parcial episode_watches_once_per_pass) acabaría con
// dos filas colisionando en episode_watches_legacy_unique (mismo
// user_id/series_id/season/episode con pass_id a null) → 23505 y el borrado
// entero abortado, dejando al usuario sin forma de quitar la serie de su
// biblioteca. Borrar las filas en vez de dejar que el FK las desenganche es
// además lo semánticamente correcto: una baja completa de biblioteca no
// debería dejar huérfana la capa "visto alguna vez" de una serie que ya no
// se seguirá. deletePass (borrado de un solo pase) sigue confiando en el SET
// NULL: ese caso sí debe conservar el historial.
export async function removeFromLibrary(itemType: ItemType, itemId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (itemType === "series") {
    const { error: watchesError } = await supabase
      .from("episode_watches")
      .delete()
      .eq("user_id", user.id)
      .eq("series_id", itemId);
    if (watchesError) throw watchesError;
  }

  const { error } = await supabase
    .from("passes")
    .delete()
    .eq("user_id", user.id)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) throw error;

  // Al salir de la biblioteca, el ítem sale de todas las colecciones del usuario
  // (Colección v2: una colección solo contiene ítems trackeados, así el recuento
  // del grid cuadra con el detalle). La RLS de collection_items ya restringe a las
  // colecciones propias, así que basta filtrar por (item_type, item_id).
  const { error: colError } = await supabase
    .from("collection_items")
    .delete()
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (colError) throw colError;

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
