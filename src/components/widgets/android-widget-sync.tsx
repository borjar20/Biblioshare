"use client";

import { useEffect } from "react";
import { getNotificationPlatform } from "@/lib/push/platform";
import { onCelebrationCheck } from "@/lib/celebrations/preference";
import { createClient } from "@/lib/supabase/client";
import { seedTimerFromWidget } from "@/lib/native/widget-timer-bootstrap";

// Arquitectura híbrida (Fase 2): los widgets LEEN su snapshot de Supabase con la
// sesión nativa (RPC get_widget_snapshot). Todos los imports del lado nativo son
// dinámicos para no meter los adaptadores del plugin en el bundle web, y todo es
// best-effort — un fallo aquí no puede tumbar el WebView.
async function ensureNative(): Promise<void> {
  try {
    const { ensureNativeSession } = await import("@/lib/native/native-auth");
    await ensureNativeSession();
  } catch (e) {
    console.error("native-auth: ensure failed", e);
  }
}
async function establishNative(): Promise<void> {
  try {
    const { establishNativeSession } = await import("@/lib/native/native-auth");
    await establishNativeSession();
  } catch (e) {
    console.error("native-auth: establish failed", e);
  }
}
async function teardownNative(): Promise<void> {
  try {
    const { teardownNativeSession } = await import("@/lib/native/native-auth");
    await teardownNativeSession();
  } catch (e) {
    console.error("native-auth: teardown failed", e);
  }
}
// Refresco inmediato del widget tirando de Supabase (app en primer plano).
async function syncWidgets(): Promise<void> {
  try {
    const { syncWidgetsNow } = await import("@/lib/native/android-widgets");
    await syncWidgetsNow();
  } catch (e) {
    console.error("widgets: sync failed", e);
  }
}

// Disparadores del refresco de widgets Android. SOLO en el WebView de Capacitor
// (en web/SSR no hace nada). Cubre el ciclo con la app abierta; el refresco con
// la app CERRADA lo lleva WorkManager en el lado nativo (programado al establecer
// la sesión). Disparadores de primer plano:
//
// - mount            → arranque en frío: asegura la sesión nativa (que ya siembra
//                      un primer pull) y pide un refresco inmediato.
// - visible          → vuelta a primer plano (y cambio de día al reabrir).
// - celebrations:check → señal de dominio del bucle diario (addSession y compañía):
//                      refresco inmediato tras registrar progreso.
// - onAuthStateChange → SIGNED_IN siembra la sesión nativa (que programa el
//                      refresco periódico + primer pull); SIGNED_OUT la revoca
//                      (que cancela el periódico y vacía el widget). El widget no
//                      necesita un pull extra aquí: la propia sesión lo hace.
export function AndroidWidgetSync() {
  useEffect(() => {
    if (getNotificationPlatform() !== "android") return;

    void seedTimerFromWidget();
    void ensureNative();
    void syncWidgets();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void seedTimerFromWidget();
        void syncWidgets();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const offCheck = onCelebrationCheck(() => void syncWidgets());

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void establishNative();
      if (event === "SIGNED_OUT") void teardownNative();
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      offCheck();
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
