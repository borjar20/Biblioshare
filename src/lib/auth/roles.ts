import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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
// app (la misma que usan las políticas RLS vía current_user_role()). Se mantiene
// el parámetro `supabase` —lo pasan ~40 llamadas— para el chequeo de sesión; la
// consulta de rol se delega en roleByUserId, que es la parte memoizada.
export async function getCurrentUserRole(
  supabase: SupabaseServerClient
): Promise<UserRole | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return roleByUserId(user.id);
}
