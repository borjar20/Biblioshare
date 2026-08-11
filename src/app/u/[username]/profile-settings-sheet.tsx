"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { logout } from "@/app/(auth)/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { GearIcon, LockIcon } from "@/components/ui/icons";
import { CelebrationPreferenceToggle } from "@/components/celebrations/celebration-preference-toggle";
import { NotificationPreferences } from "@/components/push/notification-preferences";
import { PostPreferences } from "@/components/social/post-preferences";
import { getNotificationPlatform } from "@/lib/push/platform";
import { updateProfileVisibility } from "./actions";

// Hoja de ajustes tras el engranaje (plan 05, P1 — versión interina sin el ⚙
// del topbar, que depende del topbar contextual del plan 07 P-T3). Reúne lo que
// antes andaba suelto en el perfil: visibilidad pública/privada, enlace de
// admin y cerrar sesión. Mismo <dialog> modal nativo que las hojas de la ficha
// (foco atrapado + Escape gratis).
export function ProfileSettingsSheet({
  username,
  isPublic,
  isAdmin,
  adminLabel,
}: {
  username: string;
  isPublic: boolean;
  isAdmin: boolean;
  adminLabel: string;
}) {
  const t = useTranslations("profile");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("settings")}
        className={buttonVariants("secondary", "px-2.5")}
      >
        <GearIcon className="h-4 w-4" />
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="profile-settings-title"
        className="m-auto w-[min(420px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex flex-col">
          <div className="border-b border-border px-5 py-4">
            <h2
              id="profile-settings-title"
              className="font-serif text-lg font-semibold"
            >
              {t("settings")}
            </h2>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="label-section">
                  {t("visibilityLabel")}
                </span>
                <span className="text-sm text-foreground">
                  {isPublic ? t("visibilityPublic") : t("visibilityPrivate")}
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() =>
                  startTransition(() =>
                    updateProfileVisibility(username, !isPublic),
                  )
                }
              >
                {isPublic ? t("makePrivate") : t("makePublic")}
              </Button>
            </div>

            <CelebrationPreferenceToggle />

            <NotificationPreferences />

            <PostPreferences />

            {isAdmin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 label-section underline hover:text-foreground"
              >
                <LockIcon className="h-3.5 w-3.5" />
                {adminLabel}
              </Link>
            )}
          </div>

          <div className="flex justify-end border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="secondary"
              className="px-4"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  // Cierre de sesión (spec item 2): en nativo, baja el token FCM
                  // del dispositivo ANTES de salir, para que la sesión cerrada no
                  // siga recibiendo push. Best-effort; no bloquea el logout.
                  if (getNotificationPlatform() === "android") {
                    try {
                      const { teardownAndroidPush } = await import("@/lib/push/android");
                      await teardownAndroidPush();
                    } catch {
                      // best-effort
                    }
                    // Sesión nativa (arquitectura híbrida): revócala ANTES de
                    // salir. teardown cancela el refresco periódico y vacía el
                    // widget, para que la pantalla de inicio no siga enseñando
                    // datos de la sesión cerrada. Best-effort, no bloquea el logout.
                    try {
                      const { teardownNativeSession } = await import("@/lib/native/native-auth");
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
          </div>
        </div>
      </dialog>
    </>
  );
}
