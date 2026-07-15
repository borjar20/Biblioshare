"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { passEffect } from "@/lib/passes/transitions";
import type { MediaStatus } from "./types";
import { revalidateReadingLog, revalidateLibrary } from "@/lib/reactivity/revalidate";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function updateStatus(
  entryId: string,
  itemType: ItemType,
  itemId: string,
  status: MediaStatus
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El estado y el pase abierto actuales deciden qué efecto tiene el cambio
  // de estado sobre el diario (ver passEffect en lib/passes/transitions.ts):
  // el pase es el dueño de la nota y la reseña, no library_entries.
  const { data: entry } = await supabase
    .from("library_entries")
    .select("id, status")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!entry) redirect("/login");

  const { data: openPass } = await supabase
    .from("diary_entries")
    .select("id")
    .eq("library_entry_id", entryId)
    .is("finished_on", null)
    .maybeSingle();

  const effect = passEffect(entry.status as MediaStatus, status, Boolean(openPass));

  // An item leaving "planned" shouldn't keep a stale queue membership or
  // position — it would otherwise resurface in its old queue at an old spot if
  // it's re-planned later. See docs/REQUIREMENTS.md §7.22.
  const { error } = await supabase
    .from("library_entries")
    .update({
      status,
      ...(status !== "planned" && { queue_id: null, queue_order: null }),
    })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;

  if (effect.kind === "open" || effect.kind === "openAndClose") {
    const opensToday = today();
    const { error: passError } = await supabase.from("diary_entries").insert({
      library_entry_id: entryId,
      user_id: user.id,
      started_on: opensToday,
      finished_on: effect.kind === "openAndClose" ? opensToday : null,
      is_public: true,
    });
    // Un pase abierto choca con el índice único parcial si ya había uno (dos
    // pestañas en paralelo, por ejemplo): eso es justo lo que queríamos, no
    // un error que deba explotar.
    if (passError && passError.code !== "23505") throw passError;
  } else if (effect.kind === "close" && openPass) {
    const { error: passError } = await supabase
      .from("diary_entries")
      .update({ finished_on: today() })
      .eq("id", openPass.id)
      .eq("user_id", user.id);
    // Un índice único impide cerrar dos pases del mismo ítem el mismo día:
    // si ya cerraste otro pase de esta entrada hoy, este update choca con él
    // (23505). Es el mismo caso que la rama "open" de arriba, no un error que
    // deba explotar — como mucho, terminar algo el mismo día en que ya
    // cerraste otra cosa del mismo ítem no hace nada, en vez de un 500.
    if (passError && passError.code !== "23505") throw passError;
  }

  revalidateReadingLog(itemType, itemId);
}

export async function removeFromLibrary(
  entryId: string,
  itemType: ItemType,
  itemId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("library_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateReadingLog(itemType, itemId);
}

// Moves a planned item into a named queue (or the "Sin cola" bucket when
// queueId is null) from the item detail page (§7.22). queue_order is reset to
// null so ensureQueueOrder appends it to the end of the target queue on the
// next /cola visit. A foreign queue id is rejected by the FK + queues RLS.
export async function moveEntryToQueue(
  entryId: string,
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
    .from("library_entries")
    .update({ queue_id: queueId, queue_order: null })
    .eq("id", entryId)
    .eq("user_id", user.id)
    .eq("status", "planned");

  if (error) throw error;
  revalidateReadingLog(itemType, itemId);
  revalidateLibrary();
}
