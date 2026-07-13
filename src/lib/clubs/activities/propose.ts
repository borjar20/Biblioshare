"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Json } from "@/lib/supabase/database.types";
import type { ItemType } from "@/lib/catalog/types";
import type { Position } from "@/lib/library/position";
import type { ActivityKind } from "./core";
import { notifyClub } from "./notify-club";

export type ProposedItem = { itemType: ItemType; itemId: string };

export type ProposedCheckpoint = {
  label: string;
  position: Position;
  dueOn: string | null;
};

export type ProposeInput = {
  clubId: string;
  kind: ActivityKind;
  title: string;
  description?: string;
  startsOn?: string;
  endsOn?: string;
  config?: Json | null;
  /** Pool inicial: la lectura elige su ítem, la tierlist y el reto de lista su lista. */
  items?: ProposedItem[];
  /** Solo lectura conjunta: los hitos se definen al proponer, no después. */
  checkpoints?: ProposedCheckpoint[];
};

// Proponer una actividad YA MONTADA: con su pool de ítems y sus hitos.
//
// `proposeActivity` (core.ts) solo crea la fila y ni siquiera devuelve el id, así
// que el asistente no podía dejar la actividad lista — había que crearla, entrar
// en ella y añadirle los ítems y los hitos a mano. Esto lo hace de un tirón.
//
// NO es atómico: supabase-js no abre transacción entre llamadas. Si fallan los
// ítems o los hitos, queda una actividad `proposed` a medias. Es un fallo
// benigno — nace pendiente de moderación, así que nadie la está usando, y el
// moderador puede rechazarla. Hacerlo atómico exigiría una RPC en plpgsql que
// duplicaría toda la validación que la RLS ya hace bien.
export async function proposeActivityWithSetup(
  input: ProposeInput,
): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = input.title.trim();
  if (!title) throw new Error("title_required");

  // La política "club_activities insert member" ya gatea: miembro del club,
  // created_by = auth.uid(), status forzado a 'proposed'.
  const { data: activity, error } = await supabase
    .from("club_activities")
    .insert({
      club_id: input.clubId,
      kind: input.kind,
      title,
      description: input.description?.trim() || null,
      config: input.config ?? null,
      created_by: user.id,
      starts_on: input.startsOn || null,
      ends_on: input.endsOn || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const activityId = activity.id;

  const items = input.items ?? [];
  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from("club_activity_items")
      .insert(
        items.map((item, index) => ({
          activity_id: activityId,
          item_type: item.itemType,
          item_id: item.itemId,
          added_by: user.id,
          position: index,
        })),
      );
    if (itemsError) throw itemsError;
  }

  const checkpoints = (input.checkpoints ?? []).filter((c) => c.label.trim());
  if (checkpoints.length > 0) {
    const { error: checkpointsError } = await supabase
      .from("club_activity_checkpoints")
      .insert(
        checkpoints.map((checkpoint, index) => ({
          activity_id: activityId,
          label: checkpoint.label.trim(),
          position: checkpoint.position as unknown as Json,
          due_on: checkpoint.dueOn || null,
          order: index,
          created_by: user.id,
        })),
      );
    if (checkpointsError) throw checkpointsError;
  }

  await notifyClub(
    supabase,
    input.clubId,
    user.id,
    "club_activity_proposed",
    activityId,
  );

  return activityId;
}
