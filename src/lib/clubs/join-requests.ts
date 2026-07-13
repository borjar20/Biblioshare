"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/social/notifications";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export type JoinRequest = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  requestedAt: string;
};

/** Identidad de un club, incluidos los privados. No revela su contenido. */
export type ClubIdentity = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  visibility: "public" | "private";
};

// Un club privado del que NO eres miembro: `clubs` no te deja leer la fila (RLS),
// pero `club_identities` sí te da su identidad. Es lo que permite enseñar la
// pantalla de "solicitar entrada" en vez de un 404.
export async function getClubIdentity(
  slug: string,
): Promise<ClubIdentity | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_identities")
    .select("id, slug, name, description, cover_url, visibility")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // La vista tipa sus columnas como nullable (es una vista); las de identidad
  // nunca lo son en la tabla base.
  return {
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    description: data.description,
    coverUrl: data.cover_url,
    visibility: data.visibility as "public" | "private",
  };
}

// ¿Tengo una solicitud pendiente en este club? La política de club_members deja
// ver tu propia fila aunque no seas miembro (rama `user_id = auth.uid()`), que es
// justo lo que hace falta aquí.
export async function hasPendingRequest(clubId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("club_members")
    .select("status")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.status === "requested";
}

// Pedir entrar en un club privado. Queda pendiente de moderación: 'requested' no
// es membresía (is_club_member() solo cuenta 'active'), así que no da acceso a
// nada mientras espera.
export async function requestJoinClub(clubId: string): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { error } = await supabase
    .from("club_members")
    .insert({ club_id: clubId, user_id: userId, status: "requested" });
  if (error) throw error;

  // El fan-out va por RPC, no desde aquí: para avisar a los moderadores hay que
  // saber quiénes son, y quien solicita NO puede leer el roster (no es miembro
  // todavía). Un bucle desde el cliente leería 0 filas y la notificación se
  // perdería en silencio.
  const { error: notifyError } = await supabase.rpc(
    "notify_club_join_request",
    { p_club_id: clubId },
  );
  // Best-effort, como el resto de fan-outs de la app: si el aviso falla, la
  // solicitud ya está hecha y no queremos deshacerla por eso.
  if (notifyError) console.error("notify_club_join_request failed", notifyError);
}

/** Retirar tu propia solicitud (la política DELETE ya cubre tu propia fila). */
export async function withdrawJoinRequest(clubId: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("status", "requested");
  if (error) throw error;
}

// Solo miembros ven el roster (RLS), y solo moderator+ tiene sentido que llame a
// esto — pero quien decide de verdad es la RLS, no esta función.
export async function listJoinRequests(clubId: string): Promise<JoinRequest[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("club_members")
    .select("user_id, joined_at")
    .eq("club_id", clubId)
    .eq("status", "requested")
    .order("joined_at", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Consulta aparte, no un join: club_members.user_id apunta a auth.users, no a
  // profiles, así que PostgREST no puede inferir la relación. Mismo patrón que
  // listMembers().
  const { data: identities, error: identitiesError } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in(
      "user_id",
      data.map((row) => row.user_id),
    );
  if (identitiesError) throw identitiesError;

  const byId = new Map((identities ?? []).map((i) => [i.user_id, i]));

  return data
    .map((row): JoinRequest | null => {
      const identity = byId.get(row.user_id);
      if (!identity) return null;
      return {
        userId: row.user_id,
        username: identity.username as string,
        displayName: identity.display_name,
        avatarUrl: identity.avatar_url,
        requestedAt: row.joined_at,
      };
    })
    .filter((r): r is JoinRequest => r !== null);
}

// Aprobar va por RPC: no hay política UPDATE de moderador sobre club_members (a
// propósito — permitiría reescribir roles a mano). La RPC solo promueve filas
// que estén realmente en 'requested'.
export async function approveJoinRequest(
  clubId: string,
  userId: string,
): Promise<void> {
  const { supabase, userId: actorId } = await requireUser();

  const { error } = await supabase.rpc("approve_club_join_request", {
    p_club_id: clubId,
    p_user_id: userId,
  });
  if (error) throw error;

  await notify(supabase, {
    userId,
    actorId,
    type: "club_join_approved",
  });
}

// Rechazar = borrar la fila. Lo cubre "club_members delete self or moderate": un
// moderator+ puede borrar filas de rol inferior, y una solicitud siempre tiene
// role='member'. No se notifica el rechazo: avisar de un "no" a un club privado
// es más ruido que información.
export async function rejectJoinRequest(
  clubId: string,
  userId: string,
): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("status", "requested");
  if (error) throw error;
}
