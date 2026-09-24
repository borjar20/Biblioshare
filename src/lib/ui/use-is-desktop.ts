"use client";

import { useSyncExternalStore } from "react";

// ¿Estamos en el breakpoint `lg` de Tailwind (≥ 1024px)? Para lo que NO se puede
// resolver con CSS: montar un componente en un sitio u otro, no solo
// esconderlo. Caso de uso: el detalle de un episodio lleva un <textarea> con
// guardado al salir del foco, y montado dos veces (uno oculto) habría dos
// cuadros con el mismo borrador (ficha cinemática, PR 4).
//
// useSyncExternalStore y no useState+useEffect: sin setState en efecto (#856) y
// con instantánea de servidor, así que la hidratación no descuadra: en el
// servidor y en el primer render del cliente vale `false`, y se corrige solo.
const QUERY = "(min-width: 1024px)";

// Caché perezosa a nivel de módulo: `subscribe` y `getSnapshot` se llaman
// muchas veces por render (useSyncExternalStore) y cada `matchMedia(QUERY)`
// crea un MediaQueryList nuevo — cachearlo evita ese trabajo repetido. La
// clave es la propia función `window.matchMedia`: si cambia (cada test la
// vuelve a stubbear con `vi.fn()`), la caché se invalida sola y no arrastra
// el MediaQueryList del test anterior.
let cache: { fn: typeof window.matchMedia; mql: MediaQueryList } | null = null;

function getMql(): MediaQueryList | null {
  if (typeof window.matchMedia !== "function") {
    cache = null;
    return null;
  }
  if (!cache || cache.fn !== window.matchMedia) {
    cache = { fn: window.matchMedia, mql: window.matchMedia(QUERY) };
  }
  return cache.mql;
}

function subscribe(onChange: () => void): () => void {
  const mql = getMql();
  if (!mql) return () => {};
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  // jsdom no trae matchMedia: los tests que no lo simulan ven móvil.
  return getMql()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
