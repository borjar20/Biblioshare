"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const getServerSnapshot = () => false;

// `useSyncExternalStore` lee la preferencia actual y se suscribe a los cambios
// sin un setState síncrono durante el efecto. SSR sigue siendo false.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mediaQuery = window.matchMedia(QUERY);
      mediaQuery.addEventListener("change", onStoreChange);
      return () => mediaQuery.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(QUERY).matches,
    getServerSnapshot,
  );
}
