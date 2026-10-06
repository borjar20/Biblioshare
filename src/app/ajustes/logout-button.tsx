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
          try {
            // Esperar la transacción antes de revocar Auth/navegar. Sólo se
            // purgan copias sincronizadas; las fuentes pendientes se conservan.
            const { purgePlaySavedOnLogout } = await import("@/lib/play/core/logout");
            await purgePlaySavedOnLogout();
          } catch {
            // Sin Auth verificable o IDB, el logout sigue siendo posible.
          }
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
          // El SW guarda documentos como salvavidas offline; al salir se purga
          // su caché para que no quede HTML de esta cuenta en un dispositivo
          // compartido (#680). Fire-and-forget: el SW sobrevive a la
          // navegación del logout y procesa el mensaje aunque la página cambie.
          try {
            navigator.serviceWorker?.controller?.postMessage({
              type: "purge-caches",
            });
          } catch {
            // best-effort
          }
          await logout();
        })
      }
    >
      {t("logout")}
    </Button>
  );
}
