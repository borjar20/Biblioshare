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

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  // jsdom no trae matchMedia: los tests que no lo simulan ven móvil.
  return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
