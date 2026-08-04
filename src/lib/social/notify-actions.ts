"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseNotifyCategories, type NotifyCategory } from "./notify-categories";

// Activa/actualiza la campana de avisos sobre `targetUserId`. Escribe por
// service-role: la RLS de follows solo deja al followee hacer UPDATE (aceptar
// solicitudes), y abrirle UPDATE al follower reabriría el hueco de auto-aceptarse
// en perfiles privados (20260711_social_follows.sql). Requiere follow ACEPTADO.
export async function setFollowNotify(
  targetUserId: string,
  username: string,
  categories: NotifyCategory[],
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id === targetUserId) return { ok: false };

  const clean = parseNotifyCategories(categories);

  // Solo puedes poner avisos sobre alguien a quien SIGUES (accepted). Lectura con
  // el cliente de usuario: su propia fila de follows le es visible por RLS.
  const { data: rel } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", user.id)
    .eq("followee_id", targetUserId)
    .maybeSingle();
  if (rel?.status !== "accepted") return { ok: false };

  const writer = createServiceRoleClient();
  const { error } = await writer
    .from("follows")
    .update({ notify_events: clean })
    .eq("follower_id", user.id)
    .eq("followee_id", targetUserId);
  if (error) {
    console.error("setFollowNotify failed", error);
    return { ok: false };
  }
  revalidatePath(`/u/${username}`);
  return { ok: true };
}
