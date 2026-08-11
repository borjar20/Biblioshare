import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { PasswordForm } from "./password-form";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Nueva contraseña — Biblioshare",
};

// Cambia la contraseña del usuario con sesión: tanto la sesión de
// recuperación que crea el enlace del email como una sesión normal.
export default async function PasswordPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/cuenta/contrasena"));

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-12">
      <PasswordForm />
    </div>
  );
}
