import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { planTransition } from "./transitions";
import { getActivePass } from "./get-passes";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TransitionOutcome =
  | { kind: "done"; passId: string; closed: boolean }
  | { kind: "askResume" };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Ejecuta lo que planTransition decida. Reglas del ejecutor (§7.22 + spec):
// salir de planned limpia la cola; archivar hereda el fijado en el pase
// nuevo; el resultado dice si el pase quedó cerrado para que la UI encadene
// la hoja de cierre.
export async function applyTransition(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  itemId: string,
  to: MediaStatus,
  resume?: "continue" | "restart"
): Promise<TransitionOutcome> {
  const active = await getActivePass(supabase, itemType, itemId, userId);
  const plan = planTransition(
    active ? { id: active.id, status: active.status } : null,
    to,
    today(),
    resume
  );

  const clearQueue = to !== "planned" ? { queue_id: null, queue_order: null } : {};

  if (plan.kind === "askResume") return { kind: "askResume" };

  if (plan.kind === "none") {
    return { kind: "done", passId: active!.id, closed: false };
  }

  if (plan.kind === "updateActive") {
    const { error } = await supabase
      .from("passes")
      .update({ ...plan.set, ...clearQueue })
      .eq("id", active!.id)
      .eq("user_id", userId);
    // 23505 = choque con passes_one_open / one_pass_per_day por doble click o
    // dos pestañas: el invariante hizo su trabajo, no es un 500.
    if (error && error.code !== "23505") throw error;
    return {
      kind: "done",
      passId: active!.id,
      closed: to === "completed" || to === "dropped",
    };
  }

  // createActive y archiveAndCreate comparten el insert.
  if (plan.kind === "archiveAndCreate") {
    const { error: archiveError } = await supabase
      .from("passes")
      .update({ is_active: false, queue_id: null, queue_order: null })
      .eq("id", active!.id)
      .eq("user_id", userId);
    if (archiveError) throw archiveError;
  }

  const startedOn = plan.startedOn;
  const finishedOn = plan.kind === "createActive" ? plan.finishedOn : null;
  const { data: created, error } = await supabase
    .from("passes")
    .insert({
      user_id: userId,
      item_type: itemType,
      item_id: itemId,
      status: plan.status,
      is_active: true,
      position: {},
      started_on: startedOn,
      finished_on: finishedOn,
      is_public: true,
      // El fijado es de la relación con la obra: lo hereda el pase nuevo.
      pinned_order: plan.kind === "archiveAndCreate" ? (active!.pinnedOrder ?? null) : null,
    })
    .select("id")
    .single();
  if (error && error.code !== "23505") throw error;
  return {
    kind: "done",
    passId: created?.id ?? active?.id ?? "",
    closed: plan.status === "completed" || plan.status === "dropped",
  };
}
