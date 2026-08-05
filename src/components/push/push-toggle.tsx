"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPlatform,
  getPushPermissionState,
  isPushEnabled,
  type NotificationPlatform,
  type PushPermissionState,
} from "@/lib/push/platform";

// Toggle de opt-in de notificaciones push (spec item 12). Habla con la API común
// de plataforma: no sabe si está en web o en el WebView de Capacitor. Muestra
// estados reales (activas / pendientes / denegadas / no compatible) y usa
// lenguaje de app en nativo (no «tu navegador»).

export function PushToggle() {
  const t = useTranslations("push");
  const [platform, setPlatform] = useState<NotificationPlatform>("web");
  const [permission, setPermission] = useState<PushPermissionState>("prompt");
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Estas lecturas dependen de APIs de plataforma/navegador que solo existen en
    // cliente: se resuelven al montar (el servidor asume el default seguro). Mismo
    // patrón justificado que barcode-scanner.tsx / theme-toggle.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(getNotificationPlatform());
    let active = true;
    void getPushPermissionState().then((p) => active && setPermission(p));
    void isPushEnabled().then((e) => active && setEnabled(e));
    return () => {
      active = false;
    };
  }, []);

  function enable() {
    setError(false);
    startTransition(async () => {
      try {
        const result = await enablePushNotifications();
        setPermission(result.state);
        setEnabled(result.ok);
        if (!result.ok && result.state !== "denied") setError(true);
      } catch {
        setError(true);
      }
    });
  }

  function disable() {
    startTransition(async () => {
      try {
        await disablePushNotifications();
        setEnabled(false);
        setPermission(await getPushPermissionState());
      } catch {
        setError(true);
      }
    });
  }

  const isNative = platform === "android" || platform === "ios";

  if (permission === "unsupported") {
    // Solo puede pasar en web real: en el WebView nativo nunca es "unsupported".
    return <p className="px-4 py-3 text-xs text-muted-foreground">{t("unsupported")}</p>;
  }

  if (permission === "denied") {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground">
        {isNative ? t("deniedHintNative") : t("deniedHint")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{t("toggleLabel")}</span>
          <span className="text-xs text-muted-foreground">{t("toggleHint")}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("toggleLabel")}
          disabled={isPending}
          onClick={enabled ? disable : enable}
          className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-accent" : "bg-surface-muted"
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${
              enabled ? "bg-accent-foreground" : "bg-muted-foreground"
            } ${enabled ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
          />
        </button>
      </div>
      {error && <span className="text-xs text-status-dropped">{t("error")}</span>}
    </div>
  );
}
