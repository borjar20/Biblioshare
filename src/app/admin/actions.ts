"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole, type UserRole } from "@/lib/auth/roles";

const ROLES: UserRole[] = ["user", "collaborator", "admin"];

export type UpdateUserRoleState = {
  error?: "forbidden" | "invalidRole" | "generic";
};

// Cambia el rol de un usuario. Solo admin (§7.35). La defensa a nivel de datos
// es la política RLS "admins update any profile" + el trigger anti-escalada.
export async function updateUserRole(
  targetUserId: string,
  role: UserRole
): Promise<UpdateUserRoleState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!hasMinRole(await getCurrentUserRole(supabase), "admin")) {
    return { error: "forbidden" };
  }
  if (!ROLES.includes(role)) return { error: "invalidRole" };

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("user_id", targetUserId);

  if (error) return { error: "generic" };

  revalidatePath("/admin");
  return {};
}
