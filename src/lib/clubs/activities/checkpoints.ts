"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInteractionSummary } from "@/lib/social/interactions";
import type { InteractionSummary } from "@/lib/social/interactions";
import { parsePosition, hasReachedPosition } from "@/lib/library/position";
import type { Position } from "@/lib/library/position";
import type { ItemType } from "@/lib/catalog/types";
import { revalidateClubPages } from "@/lib/reactivity/revalidate";

// Checkpoints de una actividad buddy_read (EPIC-05, Bloque H1). Hermano de
// core.ts -- misma forma "use server" plana, sin chequeo de rol en la app:
// las mutaciones se apoyan enteramente en la RLS de la migración
// (moderator+ mientras la actividad esté active) y en la RPC
// confirm_checkpoint (revalidación de servidor + cascada sobre checkpoints
// anteriores, SD-7/decisión 3-4 del diseño).

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export type CheckpointStatus = "locked" | "suggested" | "confirmed";

export type CheckpointViewModel = {
  id: string;
  label: string;
  position: Position;
  /** Fecha en la que se espera llegar. null = lectura a ritmo libre. */
  dueOn: string | null;
  order: number;
  status: CheckpointStatus;
  reachedByCount: number;
  participantCount: number;
  chat: InteractionSummary;
};

export type ActivityCheckpointsView = {
  itemType: ItemType | null; // null si la actividad aún no tiene ítem en el pool
  checkpoints: CheckpointViewModel[];
  // Checkpoint más avanzado que TODOS los participantes ya confirmaron --
  // "terreno seguro" del grupo (decisión 8 del diseño); null si nadie lo es o
  // si aún no hay participantes.
  groupSafeOrder: number | null;
  // Posición del viewer en la obra según su diario (ya se consultaba para
  // derivar el status "suggested"); null si no la tiene en la biblioteca.
  viewerPosition: Position | null;
};

const EMPTY_SUMMARY: InteractionSummary = {
  reactionCount: 0,
  viewerReacted: false,
  commentCount: 0,
  comments: [],
};

export async function getActivityCheckpoints(activityId: string): Promise<ActivityCheckpointsView> {
  const { supabase, userId } = await requireUser();

  const { data: itemRow } = await supabase
    .from("club_activity_items")
    .select("item_type, item_id")
    .eq("activity_id", activityId)
    .limit(1)
    .maybeSingle();
  const itemType = (itemRow?.item_type as ItemType | undefined) ?? null;

  const { data: checkpointRows, error: checkpointsError } = await supabase
    .from("club_activity_checkpoints")
    .select("id, label, position, order, due_on")
    .eq("activity_id", activityId)
    .order("order", { ascending: true });
  if (checkpointsError) throw checkpointsError;

  const checkpoints = checkpointRows ?? [];
  if (checkpoints.length === 0) {
    return { itemType, checkpoints: [], groupSafeOrder: null, viewerPosition: null };
  }

  const checkpointIds = checkpoints.map((c) => c.id);

  const { data: participantRows } = await supabase
    .from("club_activity_participants")
    .select("user_id")
    .eq("activity_id", activityId);
  const participantIds = (participantRows ?? []).map((p) => p.user_id);

  // La RLS ya limita estas filas a lo visible por un participante (decisión 8:
  // entre todos los participantes de la actividad) -- sin filtrado extra aquí.
  const { data: readRows, error: readsError } = await supabase
    .from("club_activity_checkpoint_reads")
    .select("checkpoint_id, user_id")
    .in("checkpoint_id", checkpointIds);
  if (readsError) throw readsError;

  const orderByCheckpointId = new Map(checkpoints.map((c) => [c.id, c.order as number]));
  const reachedCountByCheckpoint = new Map<string, number>();
  const maxOrderByUser = new Map<string, number>();
  const viewerReachedOrders = new Set<number>();
  for (const r of readRows ?? []) {
    reachedCountByCheckpoint.set(r.checkpoint_id, (reachedCountByCheckpoint.get(r.checkpoint_id) ?? 0) + 1);
    const order = orderByCheckpointId.get(r.checkpoint_id) ?? -1;
    const currentMax = maxOrderByUser.get(r.user_id) ?? -1;
    if (order > currentMax) maxOrderByUser.set(r.user_id, order);
    if (r.user_id === userId) viewerReachedOrders.add(order);
  }

  let groupSafeOrder: number | null = null;
  if (participantIds.length > 0) {
    const min = Math.min(...participantIds.map((id) => maxOrderByUser.get(id) ?? -1));
    groupSafeOrder = min >= 0 ? min : null;
  }

  let viewerPosition: Position | null = null;
  if (itemRow && itemType) {
    const { data: entry } = await supabase
      .from("library_entries")
      .select("position")
      .eq("user_id", userId)
      .eq("item_type", itemRow.item_type)
      .eq("item_id", itemRow.item_id)
      .maybeSingle();
    viewerPosition = entry ? parsePosition(itemType, entry.position) : null;
  }

  const chatByCheckpoint = await getInteractionSummary(supabase, "activity_checkpoint", checkpointIds);

  const view: CheckpointViewModel[] = checkpoints.map((c) => {
    const order = c.order as number;
    let status: CheckpointStatus = "locked";
    if (viewerReachedOrders.has(order)) {
      status = "confirmed";
    } else if (itemType && viewerPosition) {
      const targetPosition = parsePosition(itemType, c.position);
      if (hasReachedPosition(itemType, viewerPosition, targetPosition)) status = "suggested";
    }
    return {
      id: c.id,
      label: c.label,
      position: parsePosition(itemType ?? "book", c.position),
      dueOn: c.due_on,
      order,
      status,
      reachedByCount: reachedCountByCheckpoint.get(c.id) ?? 0,
      participantCount: participantIds.length,
      chat: chatByCheckpoint.get(c.id) ?? EMPTY_SUMMARY,
    };
  });

  return { itemType, checkpoints: view, groupSafeOrder, viewerPosition };
}

export async function createCheckpoint(
  activityId: string,
  label: string,
  position: Position,
  dueOn?: string | null,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmed = label.trim();
  if (!trimmed) throw new Error("label_required");

  const { count } = await supabase
    .from("club_activity_checkpoints")
    .select("id", { count: "exact", head: true })
    .eq("activity_id", activityId);

  const { error } = await supabase.from("club_activity_checkpoints").insert({
    activity_id: activityId,
    label: trimmed,
    position,
    due_on: dueOn || null,
    order: count ?? 0,
    created_by: userId,
  });
  if (error) throw error;
  revalidateClubPages();
}

export async function updateCheckpoint(
  checkpointId: string,
  patch: { label?: string; position?: Position; dueOn?: string | null },
): Promise<void> {
  const { supabase } = await requireUser();
  const update: { label?: string; position?: Position; due_on?: string | null } =
    {};
  if (patch.label !== undefined) {
    const trimmed = patch.label.trim();
    if (!trimmed) throw new Error("label_required");
    update.label = trimmed;
  }
  if (patch.position !== undefined) update.position = patch.position;
  // Cadena vacía = "quitar la fecha", no "no tocarla": el formulario manda "".
  if (patch.dueOn !== undefined) update.due_on = patch.dueOn || null;
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase.from("club_activity_checkpoints").update(update).eq("id", checkpointId);
  if (error) throw error;
  revalidateClubPages();
}

export async function deleteCheckpoint(checkpointId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("club_activity_checkpoints").delete().eq("id", checkpointId);
  if (error) throw error;
  revalidateClubPages();
}

export async function reorderCheckpoints(activityId: string, orderedIds: string[]): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("reorder_activity_checkpoints", {
    p_activity_id: activityId,
    p_checkpoint_ids: orderedIds,
  });
  if (error) throw error;
  revalidateClubPages();
}

// Revalida en servidor (posición real vs. objetivo) y, si se alcanza,
// confirma este checkpoint y todos los anteriores en la misma llamada
// (decisiones 3 y 4 del diseño) -- toda la lógica vive en la RPC.
export async function confirmCheckpoint(checkpointId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("confirm_checkpoint", { p_checkpoint_id: checkpointId });
  if (error) throw error;
  revalidateClubPages();
}
