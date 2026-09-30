"use client";

import { useEffect, useRef, useState, type AnimationEvent } from "react";
import { buzz } from "./stage-helpers";
import { useReducedMotion } from "@/lib/ui/use-reduced-motion";

/**
 * Puerta de aterrizaje multi-objeto: cuenta los animationend de `total`
 * elementos (guard target === currentTarget) y marca aterrizado con UNA
 * vibración al completarse. Cambiar de id resetea el contador. Reduced motion
 * la salta — el resultado aparece al instante.
 */
export function useLandingGate(
  id: string | null,
  total: number,
): {
  landed: boolean;
  reduced: boolean;
  onOneEnd: (e: AnimationEvent<HTMLElement>) => void;
} {
  const reduced = useReducedMotion();
  const [state, setState] = useState({ id, landed: false });
  const seen = useRef<{ id: string | null; count: number }>({ id: null, count: 0 });
  useEffect(() => {
    seen.current = { id, count: 0 };
  }, [id]);
  if (state.id !== id) {
    setState({ id, landed: false });
  }

  function onOneEnd(e: AnimationEvent<HTMLElement>) {
    if (e.target !== e.currentTarget || id === null) return;
    if (seen.current.id !== id) seen.current = { id, count: 0 };
    if (seen.current.count >= total) return;
    seen.current.count += 1;
    if (seen.current.count >= total) {
      setState({ id, landed: true });
      buzz();
    }
  }

  return { landed: id !== null && (reduced || (state.id === id && state.landed)), reduced, onOneEnd };
}
