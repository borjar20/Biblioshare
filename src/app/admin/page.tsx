import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole, type UserRole } from "@/lib/auth/roles";
import { RoleSelect } from "./role-select";

export const metadata: Metadata = {
  title: "Gestión de usuarios — Biblioshare",
};

export default async function AdminPage() {
  const t = await getTranslations("admin");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "admin")) redirect("/");

  // La política RLS "admins select all profiles" permite leer todos (incl.
  // privados). Ordenados por rol (admins primero) y luego por nombre.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, role, created_at")
    .order("role", { ascending: false })
    .order("username", { ascending: true });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">{t("colUser")}</th>
              <th className="py-2 pr-4 font-medium">{t("colSince")}</th>
              <th className="py-2 font-medium">{t("colRole")}</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <tr key={p.user_id} className="border-b border-border">
                <td className="py-2 pr-4">
                  <Link
                    href={`/u/${p.username}`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    @{p.username}
                  </Link>
                  {p.display_name && (
                    <span className="ml-2 text-muted-foreground">{p.display_name}</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {p.created_at.slice(0, 10)}
                </td>
                <td className="py-2">
                  <RoleSelect
                    userId={p.user_id}
                    currentRole={p.role as UserRole}
                    // El admin actual no se cambia su propio rol aquí.
                    disabled={p.user_id === user.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
