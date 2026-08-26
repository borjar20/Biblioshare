"use client";

// Preferencias de reproducción de notas de voz, SOLO locales (spec §2: el
// «escuchado» jamás se sincroniza ni se notifica al autor). Convención del
// repo: claves `biblioshare:*`, useSyncExternalStore con getServerSnapshot
// (la doctrina anti useState+useEffect de agenda-columns.ts:10-20) y todo
// acceso a localStorage en try/catch (Safari privado, thumbnails).

import { useSyncExternalStore } from "react";

const RATE_KEY = "biblioshare:voice-rate";
const LISTENED_KEY = "biblioshare:voice-listened";
const EVENT = "voice:preferences-change";
const LISTENED_MAX = 500;

export const VOICE_RATES = [1, 1.5, 2] as const;

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // sin window (SSR) no hay nadie escuchando
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

export function readVoiceRate(): number {
  try {
    const raw = Number(window.localStorage.getItem(RATE_KEY));
    return (VOICE_RATES as readonly number[]).includes(raw) ? raw : 1;
  } catch {
    return 1;
  }
}

/** 1 → 1.5 → 2 → 1. Devuelve la nueva velocidad ya persistida. */
export function cycleVoiceRate(): number {
  const current = readVoiceRate();
  const idx = (VOICE_RATES as readonly number[]).indexOf(current);
  const next = VOICE_RATES[(idx + 1) % VOICE_RATES.length]!;
  try {
    window.localStorage.setItem(RATE_KEY, String(next));
  } catch {
    // sin persistencia: la sesión actual sigue funcionando igual
  }
  emit();
  return next;
}

export function useVoiceRate(): number {
  return useSyncExternalStore(subscribe, readVoiceRate, () => 1);
}

function readListened(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LISTENED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function isListened(commentId: string): boolean {
  return readListened().includes(commentId);
}

export function markListened(commentId: string): void {
  try {
    const next = [...readListened().filter((id) => id !== commentId), commentId].slice(-LISTENED_MAX);
    window.localStorage.setItem(LISTENED_KEY, JSON.stringify(next));
  } catch {
    // igual que arriba: sin storage no hay punto de no-escuchado, y ya
  }
  emit();
}

export function useListened(commentId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isListened(commentId),
    () => true, // en servidor, sin punto: no parpadea un "no escuchado" falso
  );
}
