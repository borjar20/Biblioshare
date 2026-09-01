"use client";

import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

const HOLD_DELAY_MS = 400;
const REPEAT_MS = 120;

/**
 * Gesto de mantener-pulsado compartido (spec reloj-visual §1): tap/teclado =
 * UN onCommit(step); mantener (≥holdDelayMs) acumula EN LOCAL (onPreview corre
 * el número en pantalla cada repeatMs) y al soltar emite UN onCommit con el
 * total — un gesto = un deshacer. Trae los arreglos de la review de recursos:
 * timers limpiados al reempezar y al desmontar, justHeld reseteado en cada
 * pointerdown (un click suprimido por el menú contextual no se traga el
 * siguiente toque), cancel en pointerleave/pointercancel y preventDefault del
 * menú contextual. El consumidor esparce `handlers` en su elemento y añade ÉL
 * `select-none` y `[touch-action:manipulation]` a su className.
 */
export function useHoldRepeat({
  step,
  onPreview,
  onCommit,
  holdDelayMs = HOLD_DELAY_MS,
  repeatMs = REPEAT_MS,
}: {
  step: number;
  onPreview: (accumulated: number) => void;
  onCommit: (total: number) => void;
  holdDelayMs?: number;
  repeatMs?: number;
}): {
  handlers: {
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
    onContextMenu: (e: ReactMouseEvent) => void;
    onClick: () => void;
  };
} {
  const acc = useRef(0);
  const held = useRef(false);
  const justHeld = useRef(false);
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimers() {
    if (delay.current) clearTimeout(delay.current);
    if (repeat.current) clearInterval(repeat.current);
    delay.current = null;
    repeat.current = null;
  }

  // Limpieza al desmontar: un elemento que desaparece a mitad de mantener no
  // deja el interval vivo.
  useEffect(() => {
    return () => {
      if (delay.current) clearTimeout(delay.current);
      if (repeat.current) clearInterval(repeat.current);
    };
  }, []);

  function start() {
    stopTimers();
    justHeld.current = false;
    held.current = false;
    acc.current = 0;
    delay.current = setTimeout(() => {
      held.current = true;
      acc.current = step;
      onPreview(acc.current);
      repeat.current = setInterval(() => {
        acc.current += step;
        onPreview(acc.current);
      }, repeatMs);
    }, holdDelayMs);
  }

  function finish() {
    stopTimers();
    if (held.current) {
      justHeld.current = true;
      onCommit(acc.current);
      onPreview(0);
      held.current = false;
      acc.current = 0;
    }
  }

  function cancel() {
    stopTimers();
    if (held.current) {
      onPreview(0);
      held.current = false;
      acc.current = 0;
    }
  }

  return {
    handlers: {
      onPointerDown: start,
      onPointerUp: finish,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
      onClick: () => {
        if (justHeld.current) {
          justHeld.current = false;
          return;
        }
        onCommit(step);
      },
    },
  };
}
