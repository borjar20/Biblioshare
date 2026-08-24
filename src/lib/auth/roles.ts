import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

// Jerarquía user < collaborator < admin (mismo orden que el enum en BD). El rol
// mayor hereda los permisos de los menores. Ver docs/REQUIREMENTS.md §7.35.
const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  collaborator: 1,
  admin: 2,
};

export function hasMinRole(role: UserRole | null, min: UserRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

// El rol por userId, memoizado POR PETICIÓN con cache() de React. La ficha llama
// a getCurrentUserRole dos veces en el mismo render (página + pestañas), pero
// cada componente crea su propio cliente Supabase, así que memoizar por el
// cliente NO deduplicaría (cache() indexa por identidad del argumento). Keyear
// por el userId —un string estable— sí: la segunda llamada es un acierto de
// caché y se ahorra la consulta a `profiles` (#447). Cliente propio dentro: se
// memoiza el RESULTADO, no la instancia (misma regla que getCurrentUser, ver
// server.ts).
const roleByUserId = cache(
  async (userId: string): Promise<UserRole | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.role ?? null;
  }
);

// Rol del usuario autenticado, o null si no hay sesión. Fuente de verdad en la
// app (la misma que usan las políticas RLS vía current_user_role()).
//
// SIN parámetro `supabase` desde F1-027. Antes lo recibía —lo pasaban ~35
// llamadas— y hacía con él `auth.getUser()`, que es un VIAJE DE RED a
// /auth/v1/user (~240 ms), no una lectura local: la ficha de película llamaba a
// esta función dos veces por render y pagaba los dos. `getCurrentUser()` hace
// exactamente lo mismo pero memoizado con React.cache(), así que la sesión se
// pide una vez por petición pase por donde pase (reincidencia del #283).
//
// Quitar el parámetro en vez de ignorarlo es deliberado: mientras estuviera en
// la firma seguiría leyéndose como «el rol depende del cliente que le pases», y
// no depende — depende de la cookie de sesión de la petición.
export async function getCurrentUserRole(): Promise<UserRole | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  return roleByUserId(user.id);
}
