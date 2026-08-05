import type { CelebrationPreference } from "./types";

// La preferencia de celebraciones vive en localStorage, como el tema: sin
// latencia, sin columna de perfil, sin round-trip en el provider. Si algún día
// se quiere que viaje entre dispositivos, se añade una columna a `profiles` y se
// lee aquí — el resto del sistema no cambia.
// ponytail: localStorage basta para una preferencia de UI; cross-device = issue aparte.
const KEY = "biblioshare:celebration-preference";
const EVENT = "celebrations:preference-change";

export function readCelebrationPreference(): CelebrationPreference {
  if (typeof window === "undefined") return "full";
  const value = window.localStorage.getItem(KEY);
  return value === "reduced" || value === "disabled" ? value : "full";
}

export function writeCelebrationPreference(pref: CelebrationPreference): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, pref);
  // Avisa al provider (vive en otra rama del árbol) sin prop drilling.
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pref }));
}

export function onCelebrationPreferenceChange(
  handler: (pref: CelebrationPreference) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// Suscripción para useSyncExternalStore: reacciona al cambio en esta pestaña
// (evento propio) y en otras (storage). Así la preferencia se lee sin
// useEffect+setState — hidratación segura, sin el lint react-hooks.
export function subscribeCelebrationPreference(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

// Señal "revisa si hay celebraciones que drenar", para llamar tras una mutación
// de dominio desde cualquier componente cliente SIN usar el hook ni prop
// drilling. El provider la escucha y drena.
const CHECK_EVENT = "celebrations:check";

export function checkCelebrations(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHECK_EVENT));
}

export function onCelebrationCheck(handler: () => void): () => void {
  window.addEventListener(CHECK_EVENT, handler);
  return () => window.removeEventListener(CHECK_EVENT, handler);
}
