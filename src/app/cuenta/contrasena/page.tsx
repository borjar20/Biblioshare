import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { PageHeader } from "@/components/ui/page-header";
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
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/cuenta/contrasena"));

  const [t, tSettings] = await Promise.all([
    getTranslations("auth.newPassword"),
    getTranslations("settings"),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-12">
      {/* Vuelta a /ajustes: hasta ahora esta ruta era huérfana —cero enlaces en
          `src/`, solo se llegaba por el correo de recuperación— y por eso no
          tenía ni título de página ni salida. Ahora se entra desde Ajustes ›
          Cuenta, así que la salida es volver allí. Quien llegue desde el correo
          también tiene sesión, así que el enlace le sirve igual. */}
      <PageHeader
        title={t("title")}
        backHref="/ajustes"
        backLabel={tSettings("title")}
      />
      <PasswordForm />
    </div>
  );
}
