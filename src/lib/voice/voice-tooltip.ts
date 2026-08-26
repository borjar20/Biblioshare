"use client";

// Visibilidad del bubble "ahora puedes responder con voz" (spec §3), la
// primera vez que el usuario ve el mic. Antes vivía como useState perezoso
// leyendo localStorage en el inicializador; en SSR ese inicializador no
// puede leer storage (no hay window), así que el HTML del servidor no
// coincidía con el primer render de cliente -> mismatch de hidratación ->
// React regenera el subárbol del composer justo tras el primer paint -> un
// clic que cae en esa ventana se pierde en silencio (issue #838). Mismo
// remedio que voice-preferences.ts: useSyncExternalStore con
// getServerSnapshot fijo, para que servidor y cliente pinten IGUAL en el
// primer render y el tooltip solo aparezca tras hidratar.

import { useSyncExternalStore } from "react";

const KEY = "biblioshare:voice-tooltip-seen";
const EVENT = "voice:tooltip-seen";

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(KEY) != null;
  } catch {
    return true; // sin storage no molestamos con el tooltip
  }
}

export function markVoiceTooltipSeen(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // sin persistencia: el tooltip volverá, no es grave
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // SSR: nadie escucha
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useVoiceTooltipVisible(): boolean {
  // getServerSnapshot false: el servidor nunca pinta el tooltip, así el HTML
  // hidrata idéntico y el tooltip aparece tras la hidratación (issue #838).
  return useSyncExternalStore(subscribe, () => !readSeen(), () => false);
}
