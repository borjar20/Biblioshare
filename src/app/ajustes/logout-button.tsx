"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { getNotificationPlatform } from "@/lib/push/platform";

// Cerrar sesión, tal cual venía de la hoja de ajustes del perfil. El cuerpo NO
// se simplifica al mudarse: en nativo hay que bajar el token FCM y revocar la
// sesión del dispositivo ANTES de salir, o la sesión cerrada sigue recibiendo
// push y el widget de la pantalla de inicio sigue enseñando datos de alguien
// que ya no está dentro. Los dos pasos son best-effort y no bloquean el logout.
export function LogoutButton() {
  const t = useTranslations("profile");
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      className="px-4"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          if (getNotificationPlatform() === "android") {
            try {
              const { teardownAndroidPush } = await import("@/lib/push/android");
              await teardownAndroidPush();
            } catch {
              // best-effort
            }
            try {
              const { teardownNativeSession } = await import(
                "@/lib/native/native-auth"
              );
              await teardownNativeSession();
            } catch {
              // best-effort
            }
          }
          await logout();
        })
      }
    >
      {t("logout")}
    </Button>
  );
}
