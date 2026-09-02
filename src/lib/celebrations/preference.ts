import type { CelebrationPayload, CelebrationPreference } from "./types";

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

// Señal "se acaban de encolar celebraciones para mostrar", con su payload. La
// compañera (src/components/pet/pet-companion.tsx) la escucha para saltar: es
// un consumidor más del canal ganar → drenar, sin tocar la cola del provider.
const SHOWN_EVENT = "celebrations:shown";

export function emitCelebrationsShown(items: CelebrationPayload[]): void {
  if (typeof window === "undefined" || items.length === 0) return;
  window.dispatchEvent(new CustomEvent<CelebrationPayload[]>(SHOWN_EVENT, { detail: items }));
}

export function onCelebrationsShown(handler: (items: CelebrationPayload[]) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<CelebrationPayload[]>).detail ?? []);
  window.addEventListener(SHOWN_EVENT, listener);
  return () => window.removeEventListener(SHOWN_EVENT, listener);
}
