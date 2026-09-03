"use client";

import { useEffect, useState } from "react";

// prefers-reduced-motion como estado React. Arranca en false (SSR) y se
// corrige al montar — mismo patrón de carga-en-efecto que el resto de Play
// (deuda de lint #856 asumida en este patrón).
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
