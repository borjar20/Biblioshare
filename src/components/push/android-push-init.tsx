"use client";

import { useEffect } from "react";
import { getNotificationPlatform } from "@/lib/push/platform";

// Arranque del push nativo Android (spec item 2). SOLO en el WebView de
// Capacitor: en web no hace nada (y ni siquiera carga el plugin nativo, que se
// importa dinámicamente). Deja los listeners listos para un arranque en frío
// desde una notificación y refresca el token si el permiso ya está concedido.
//
// Navega con window.location (no el router): al volver de la actividad nativa el
// contexto del router de React no sobrevive de forma fiable en el WebView —
// mismo motivo que barcode-scanner.tsx.
export function AndroidPushInit() {
  useEffect(() => {
    if (getNotificationPlatform() !== "android") return;
    let cancelled = false;
    void import("@/lib/push/android").then(({ initAndroidPush }) => {
      if (!cancelled) {
        void initAndroidPush((path) => window.location.assign(path));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
