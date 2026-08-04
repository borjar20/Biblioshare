"use server";

import { createClient } from "@/lib/supabase/server";
import { getEventFollowers, type FollowerPage } from "./event-detail";

// La paginación de la lista de seguidores, expuesta al panel «Ver todos».
//
// Es una server action y no un route handler porque no necesita ser una URL: solo
// la llama ese panel. La RLS de club_event_followers ya limita a miembros activos
// del club, así que no hay gate extra aquí — pero sí se resuelve el organizador en
// servidor en vez de aceptarlo del cliente: si viniera por parámetro, cualquiera
// podría pedir que se marcase a quien quisiera como «Organiza».
export async function fetchEventFollowers(
  activityId: string,
  page: number,
): Promise<FollowerPage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { followers: [], total: 0, hasMore: false };

  const { data: event } = await supabase
    .from("club_activities")
    .select("created_by")
    .eq("id", activityId)
    .maybeSingle();
  if (!event) return { followers: [], total: 0, hasMore: false };

  return getEventFollowers(activityId, user.id, event.created_by, Math.max(0, page));
}
