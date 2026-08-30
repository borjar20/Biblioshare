"use client";

import { useEffect } from "react";

/**
 * Mantiene la pantalla encendida mientras hay partida. **Best-effort**: la API no
 * existe en todos los navegadores y el sistema suelta el bloqueo cuando le apetece
 * (al minimizar, sobre todo) sin devolverlo solo. Por eso todo va en `try/catch` y
 * se REPIDE al volver a ser visible.
 *
 * Sin wake lock se juega igual: la pantalla se apaga sola y se vuelve a encender.
 * Nunca puede tumbar el tablero.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const next = await navigator.wakeLock?.request("screen");
        // El efecto puede haberse limpiado mientras la promesa estaba en vuelo: sin
        // esta guarda quedaría un bloqueo vivo que ya nadie suelta.
        if (cancelled) {
          await next?.release();
          return;
        }
        sentinel = next ?? null;
      } catch {
        // Sin wake lock la pantalla se apaga sola. No es motivo para romper nada.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
