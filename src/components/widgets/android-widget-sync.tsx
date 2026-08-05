"use client";

import { useEffect } from "react";
import { getNotificationPlatform } from "@/lib/push/platform";
import { onCelebrationCheck } from "@/lib/celebrations/preference";
import { requestWidgetSync } from "@/lib/widgets/sync";
import { createClient } from "@/lib/supabase/client";

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
// - onAuthStateChange → inicio/cierre/restauración de sesión.
//
// Todo pasa por requestWidgetSync, que agrupa y deduplica.
export function AndroidWidgetSync() {
  useEffect(() => {
    if (getNotificationPlatform() !== "android") return;

    requestWidgetSync("mount");

    const onVisibility = () => {
      requestWidgetSync(
        document.visibilityState === "visible" ? "resume" : "background",
      );
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
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      offCheck();
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
