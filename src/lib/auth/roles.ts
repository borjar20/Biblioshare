import type { createClient } from "@/lib/supabase/server";
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

// Rol del usuario autenticado, o null si no hay sesión. Fuente de verdad en la
// app (la misma que usan las políticas RLS vía current_user_role()).
export async function getCurrentUserRole(
  supabase: SupabaseServerClient
): Promise<UserRole | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.role ?? null;
}
