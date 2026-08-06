"use client";

import { useEffect } from "react";
import { getNotificationPlatform } from "@/lib/push/platform";
import { onCelebrationCheck } from "@/lib/celebrations/preference";
import { requestWidgetSync } from "@/lib/widgets/sync";
import { createClient } from "@/lib/supabase/client";
import { seedTimerFromWidget } from "@/lib/native/widget-timer-bootstrap";

// Sesión nativa (arquitectura híbrida): import dinámico para no meter el
// adaptador del plugin en el bundle web. Todas best-effort — un fallo aquí no
// puede tumbar el WebView, que sigue funcionando con su propia sesión.
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

// Disparadores de la sincronización de widgets Android. SOLO en el WebView de
// Capacitor (en web no hace nada). Cubre el ciclo completo sin sembrar
// llamadas por toda la app:
//
// - mount            → arranque en frío de la app.
// - visible          → vuelta a primer plano (y cambio de día al reabrir).
// - hidden           → el usuario SE VA: lo que haya mutado en la sesión
//                      (episodios, estados de pase, objetivo…) se empuja justo
//                      cuando el widget vuelve a ser lo que se ve. Es la red de
//                      seguridad que evita instrumentar cada mutación.
// - celebrations:check → señal de dominio que ya emite el bucle diario
//                      (addSession y compañía): actualización inmediata tras
//                      registrar progreso, sin esperar al hidden.
// - onAuthStateChange → inicio/cierre/restauración de sesión. Además del
//                      snapshot, gestiona la SESIÓN NATIVA (arquitectura
//                      híbrida): al iniciar sesión se siembra una sesión
//                      Supabase propia del lado nativo; al cerrarla se revoca.
//
// Todo pasa por requestWidgetSync, que agrupa y deduplica.
export function AndroidWidgetSync() {
  useEffect(() => {
    if (getNotificationPlatform() !== "android") return;

    requestWidgetSync("mount");
    void seedTimerFromWidget();
    // Arranque en frío: asegura la sesión nativa si aún no la hay (best-effort).
    void ensureNative();

    const onVisibility = () => {
      const visible = document.visibilityState === "visible";
      requestWidgetSync(visible ? "resume" : "background");
      if (visible) void seedTimerFromWidget();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const offCheck = onCelebrationCheck(() => requestWidgetSync("mutation"));

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        requestWidgetSync("auth");
      }
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
