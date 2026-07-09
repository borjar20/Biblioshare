import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "Nueva contraseña — Biblioshare",
};

// Cambia la contraseña del usuario con sesión: tanto la sesión de
// recuperación que crea el enlace del email como una sesión normal.
export default async function PasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-12">
      <PasswordForm />
    </div>
  );
}
