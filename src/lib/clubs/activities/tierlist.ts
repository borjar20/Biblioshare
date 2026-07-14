"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemKey } from "./list-challenge-types";
import { parseTierlistConfig } from "./tierlist-types";
import type { ParticipantBoard, TierlistView } from "./tierlist-types";
import { revalidateClubPages } from "@/lib/reactivity/revalidate";

// Tierlist de club (EPIC-05, Bloque H2). Hermano de checkpoints.ts (H1), list-challenge.ts
// (H3) y criteria-challenge.ts (H4) -- pero el PRIMERO con mutaciones: H3 y H4 son de solo
// lectura porque su progreso es derivado de los pases de diario; aquí la colocación ES el dato.
//
// Sin SECURITY DEFINER en ninguna parte: club_activity_placements es tabla propia, así que su
// RLS (participante ve todas, cada cual escribe la suya) basta -- no hay que saltarse la RLS
// de perfil como en H3/H4, que leían diary_entries.
//
// Sin consenso del club (decisión de diseño): promediar los tiers aplanaría justo el
// desacuerdo, que es el punto de una tierlist.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export async function getTierlists(activityId: string): Promise<TierlistView | null> {
  const { supabase, userId } = await requireUser();

  const { data: activityRow, error: activityError } = await supabase
    .from("club_activities")
    .select("config")
    .eq("id", activityId)
    .maybeSingle();
  if (activityError) throw activityError;

  const config = parseTierlistConfig(activityRow?.config ?? null);
  if (!config) return null; // sin tiers todavía -- la UI lo dice en vez de romperse

  const [itemResult, placementResult, participantResult] = await Promise.all([
    supabase.from("club_activity_items").select("item_type, item_id").eq("activity_id", activityId),
    supabase
      .from("club_activity_placements")
      .select("user_id, item_type, item_id, tier, position")
      .eq("activity_id", activityId)
      .order("position", { ascending: true }),
    supabase.from("club_activity_participants").select("user_id").eq("activity_id", activityId),
  ]);
  if (itemResult.error) throw itemResult.error;
  if (placementResult.error) throw placementResult.error;
  if (participantResult.error) throw participantResult.error;

  const poolKeys = (itemResult.data ?? []).map((i) => itemKey(i.item_type, i.item_id));
  const participantIds = (participantResult.data ?? []).map((p) => p.user_id);
  if (participantIds.length === 0) return { tiers: config.tiers, boards: [] };

  const { data: identities } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", participantIds);

  const identityById = new Map(
    (identities ?? [])
      .filter((i): i is typeof i & { user_id: string; username: string } =>
        i.user_id != null && i.username != null,
      )
      .map((i) => [i.user_id, i]),
  );

  // Colocaciones por persona. Una fila con un tier que NO está en config se ignora (queda como
  // "sin colocar") -- config es opaco a SQL y no puede validarlo, así que ningún dato raro debe
  // poder romper el tablero. Igual con un ítem que se quitó del pool después de colocarlo.
  const poolKeySet = new Set(poolKeys);
  const placedByUser = new Map<string, Record<string, string[]>>();
  for (const placement of placementResult.data ?? []) {
    // La colocación guarda la ETIQUETA del nivel; si el nivel ya no existe
    // (lo borraron de la config), la colocación se ignora.
    if (!config.tiers.some((tier) => tier.label === placement.tier)) continue;
    const key = itemKey(placement.item_type, placement.item_id);
    if (!poolKeySet.has(key)) continue;
    const byTier = placedByUser.get(placement.user_id) ?? {};
    byTier[placement.tier] = [...(byTier[placement.tier] ?? []), key];
    placedByUser.set(placement.user_id, byTier);
  }

  const boards: ParticipantBoard[] = participantIds
    .map((id): ParticipantBoard | null => {
      const identity = identityById.get(id);
      if (!identity) return null;

      const itemKeysByTier: Record<string, string[]> = {};
      const placed = placedByUser.get(id) ?? {};
      for (const tier of config.tiers)
        itemKeysByTier[tier.label] = placed[tier.label] ?? [];

      const placedKeys = new Set(Object.values(itemKeysByTier).flat());
      return {
        userId: id,
        username: identity.username,
        displayName: identity.display_name,
        avatarUrl: identity.avatar_url,
        isViewer: id === userId,
        itemKeysByTier,
        unplacedItemKeys: poolKeys.filter((k) => !placedKeys.has(k)),
      };
    })
    .filter((b): b is ParticipantBoard => b !== null)
    // El viewer primero: su tablero es el que edita y el que más mira.
    .sort((a, b) => {
      if (a.isViewer !== b.isViewer) return a.isViewer ? -1 : 1;
      return a.username.localeCompare(b.username);
    });

  return { tiers: config.tiers, boards };
}

// Upsert de TU colocación. Sin chequeo de rol en la app: la RLS es la autoridad (`insert own`
// / `update own` exigen user_id = auth.uid() y ser participante).
export async function setPlacement(
  activityId: string,
  itemType: ItemType,
  itemId: string,
  tier: string,
  position: number,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("club_activity_placements").upsert(
    {
      activity_id: activityId,
      user_id: userId,
      item_type: itemType,
      item_id: itemId,
      tier,
      position,
    },
    { onConflict: "activity_id,user_id,item_type,item_id" },
  );
  if (error) throw error;
  revalidateClubPages();
}

// Devolver un ítem a la bandeja de "sin colocar".
export async function clearPlacement(
  activityId: string,
  itemType: ItemType,
  itemId: string,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("club_activity_placements")
    .delete()
    .eq("activity_id", activityId)
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) throw error;
  revalidateClubPages();
}
