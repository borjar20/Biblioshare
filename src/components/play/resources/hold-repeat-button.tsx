"use client";

import { useEffect, useRef } from "react";

const HOLD_DELAY_MS = 400;
const REPEAT_MS = 120;

/**
 * Botón ±1 con mantener-pulsado: el toque emite onCommit(±1); mantener repite
 * EN LOCAL (onPreview corre el número en pantalla) y al soltar emite UN
 * onCommit con el total — un gesto = un deshacer (spec recursos §2). Salir
 * del botón con el dedo CANCELA la acumulación. El click de teclado
 * (Enter/Espacio) emite ±1.
 */
export function HoldRepeatButton({
  direction,
  label,
  onPreview,
  onCommit,
}: {
  direction: 1 | -1;
  label: string;
  onPreview: (accumulated: number) => void;
  onCommit: (delta: number) => void;
}) {
  const acc = useRef(0);
  const held = useRef(false);
  // justHeld: el click sintético llega DESPUÉS del pointerup — sin esta marca,
  // un mantener emitiría su total y además un ±1 extra por el click.
  const justHeld = useRef(false);
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimers() {
    if (delay.current) clearTimeout(delay.current);
    if (repeat.current) clearInterval(repeat.current);
    delay.current = null;
    repeat.current = null;
  }

  // Limpieza al desmontar: una fila que desaparece a mitad de mantener (p. ej.
  // la otra pestaña borró el recurso vía CAS) no deja el interval vivo.
  useEffect(() => {
    return () => {
      if (delay.current) clearTimeout(delay.current);
      if (repeat.current) clearInterval(repeat.current);
    };
  }, []);

  function start() {
    // Un segundo pointerdown (multitouch accidental) no debe huérfanear el
    // interval anterior, y un justHeld pegado (click suprimido por el menú
    // contextual) no debe tragarse el siguiente toque (review final).
    stopTimers();
    justHeld.current = false;
    held.current = false;
    acc.current = 0;
    delay.current = setTimeout(() => {
      held.current = true;
      acc.current = direction;
      onPreview(acc.current);
      repeat.current = setInterval(() => {
        acc.current += direction;
        onPreview(acc.current);
      }, REPEAT_MS);
    }, HOLD_DELAY_MS);
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

  // Hardening táctil de la casa (damage-overlay): onContextMenu preventDefault
  // mata el menú del long-press en Android, select-none la selección de texto
  // y touch-action:manipulation el zoom por doble toque en iOS.
  return (
    <button
      type="button"
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={start}
      onPointerUp={finish}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={() => {
        if (justHeld.current) {
          justHeld.current = false;
          return;
        }
        onCommit(direction);
      }}
      className="h-10 w-10 select-none rounded-chip border border-border text-[18px] font-semibold [touch-action:manipulation]"
    >
      {direction > 0 ? "+" : "−"}
    </button>
  );
}
