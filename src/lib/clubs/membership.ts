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

// Solo clubes públicos -- unirse a uno privado es exclusivamente por
// invitación (ver Task 1). Si clubId corresponde a un club privado, la
// SELECT ya devuelve 0 filas para un no-miembro (RLS: SD-4), así que esto
// falla igualmente sin necesitar un chequeo aparte -- el error explícito
// aquí es solo para un mensaje más claro si algo en la UI llegara a
// ofrecer este botón por error.
export async function joinClub(clubId: string): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("visibility")
    .eq("id", clubId)
    .single();
  if (clubError) throw clubError;
  if (club.visibility !== "public") {
    throw new Error("private_clubs_require_invitation");
  }

  const { error } = await supabase
    .from("club_members")
    .insert({ club_id: clubId, user_id: userId, status: "active" });
  if (error) throw error;
}

// Rechaza si el actor es owner y hay otros miembros activos -- debe
// transferir la propiedad primero (ver design spec). Si es el único
// miembro, borra el club (el trigger reassign_club_ownership también lo
// haría, pero comprobarlo aquí da un mensaje de error claro en vez de un
// borrado silencioso).
export async function leaveClub(clubId: string): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { data: membership, error: membershipError } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return;

  if (membership.role === "owner") {
    const { count, error: countError } = await supabase
      .from("club_members")
      .select("user_id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "active")
      .neq("user_id", userId);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new Error("owner_must_transfer_before_leaving");
    }
  }

  const { error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId);
  if (error) throw error;
}

// moderator+ solo puede invitar; role siempre queda 'member' (promociones
// posteriores van por setMemberRole). No-op si ya existe una fila para ese
// usuario (ya invitado o ya activo) -- no hay un estado 'pending' que
// aprobar directamente (ver Task 1).
export async function inviteMember(clubId: string, userId: string): Promise<void> {
  const { supabase, userId: actorId } = await requireUser();

  const { data: existing } = await supabase
    .from("club_members")
    .select("status")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase
    .from("club_members")
    .insert({ club_id: clubId, user_id: userId, status: "invited" });
  if (error) throw error;

  try {
    await notify(supabase, {
      userId,
      actorId,
      type: "club_invite",
      targetType: "club",
      targetId: clubId,
    });
  } catch (notifyError) {
    console.error("inviteMember notify failed", notifyError);
  }
}

export async function acceptInvite(clubId: string): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("owner_id")
    .eq("id", clubId)
    .single();
  if (clubError) throw clubError;

  const { data, error } = await supabase
    .from("club_members")
    .update({ status: "active" })
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("status", "invited")
    .select("club_id");
  if (error) throw error;

  // Solo notifica si de verdad había una invitación pendiente que aceptar
  // (evita notificar dos veces con un doble clic).
  if (data && data.length > 0) {
    try {
      await notify(supabase, {
        userId: club.owner_id,
        actorId: userId,
        type: "club_invite_accepted",
        targetType: "club",
        targetId: clubId,
      });
    } catch (notifyError) {
      console.error("acceptInvite notify failed", notifyError);
    }
  }
}

export async function declineInvite(clubId: string): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("status", "invited");
  if (error) throw error;
}

// No permite auto-eliminarse por esta vía -- el RLS de borrado permite
// self-delete incondicional (cualquier rol), lo que saltaría el chequeo de
// transferencia de propiedad de leaveClub. Quien quiera salir debe usar
// leaveClub.
export async function removeMember(clubId: string, userId: string): Promise<void> {
  const { supabase, userId: actorId } = await requireUser();
  if (userId === actorId) {
    throw new Error("use_leave_club_to_remove_yourself");
  }

  const { error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function setMemberRole(
  clubId: string,
  userId: string,
  role: "member" | "moderator",
): Promise<void> {
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc("set_club_member_role", {
    p_club_id: clubId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}

export async function transferOwnership(clubId: string, newOwnerId: string): Promise<void> {
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc("transfer_club_ownership", {
    p_club_id: clubId,
    p_new_owner_id: newOwnerId,
  });
  if (error) throw error;
}
