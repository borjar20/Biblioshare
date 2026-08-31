"use client";

import { useRef, useState, type AnimationEvent } from "react";
import { buzz } from "./stage-helpers";
import { useReducedMotion } from "./use-reduced-motion";

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
  const [landedId, setLandedId] = useState<string | null>(null);
  const seen = useRef<{ id: string | null; count: number }>({ id: null, count: 0 });

  function onOneEnd(e: AnimationEvent<HTMLElement>) {
    if (e.target !== e.currentTarget || id === null) return;
    if (seen.current.id !== id) seen.current = { id, count: 0 };
    seen.current.count += 1;
    if (seen.current.count >= total) {
      setLandedId(id);
      buzz();
    }
  }

  return { landed: id !== null && (reduced || landedId === id), reduced, onOneEnd };
}
