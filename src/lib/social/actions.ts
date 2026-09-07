"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "./notifications";
import { usersAreBlocked } from "./block-state";
import {
  revalidateFeed,
  revalidateProfilePages,
  revalidateSocialBurrows,
} from "@/lib/reactivity/revalidate";

// Mutaciones del grafo social (EPIC-05, Bloque A). El status correcto
// (accepted vs pending) lo decide la regla de auto-accept según si el perfil
// destino es público; la RLS de `follows` lo blinda además a nivel de BD
// (nadie puede auto-insertarse como seguidor aceptado de un perfil privado).

// Revalida todas las páginas de perfil: los contadores y el estado del botón
// aparecen en varias (perfil propio y ajeno). Mismo patrón que toggleFavorite.
function revalidateProfiles() {
  revalidateProfilePages();
  revalidateSocialBurrows();
}

export async function followUser(targetUserId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.id === targetUserId) return;

  if (await usersAreBlocked(supabase, targetUserId)) {
    throw new Error("No puedes seguir a este usuario");
  }

  // profile_is_public es SECURITY DEFINER: puede leer el flag de un perfil
  // privado ajeno (que la RLS de profiles ocultaría) para decidir el status.
  const { data: isPublic, error: rpcError } = await supabase.rpc(
    "profile_is_public",
    { target_user_id: targetUserId },
  );
  if (rpcError) throw rpcError;

  const { error } = await supabase.from("follows").insert({
    follower_id: user.id,
    followee_id: targetUserId,
    status: isPublic ? "accepted" : "pending",
  });
  // Idempotente: si ya existe la relación (PK duplicada), no es un error real.
  if (error && error.code !== "23505") throw error;

  // Solo notifica en un alta NUEVA, no en un duplicado idempotente.
  if (!error) {
    await notify(supabase, {
      userId: targetUserId,
      actorId: user.id,
      type: isPublic ? "new_follower" : "follow_request",
    });
  }
  revalidateProfiles();
  // La card "A quién seguir" del home vive fuera de /u/[username]: sin esto,
  // el botón "Seguir" desde la sidebar del feed no se refresca hasta navegar
  // fuera y volver (hallazgo de la review de la Task 8).
  revalidateFeed();
}

export async function unfollowUser(targetUserId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", targetUserId);

  if (error) throw error;
  revalidateProfiles();
}

// El followee acepta una solicitud pendiente (perfil privado).
export async function acceptFollowRequest(followerId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("follows")
    .update({ status: "accepted" })
    .eq("follower_id", followerId)
    .eq("followee_id", user.id)
    .eq("status", "pending")
    .select("follower_id");

  if (error) throw error;
  // Solo notifica si de verdad había una solicitud pendiente que aceptar
  // (evita notificar dos veces con un doble clic).
  if (data && data.length > 0) {
    await notify(supabase, {
      userId: followerId,
      actorId: user.id,
      type: "follow_accepted",
    });
  }
  revalidateProfiles();
}

// El followee rechaza una solicitud (o retira a un seguidor): se borra la fila.
export async function rejectFollowRequest(followerId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("followee_id", user.id);

  if (error) throw error;
  revalidateProfiles();
}
