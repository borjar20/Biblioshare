"use client";

import type { ReactNode } from "react";
import { seatAccent } from "@/lib/play/ui/seats";

/**
 * Iniciales para una ficha. Con dos o más palabras toma la inicial de las dos
 * primeras: «Jugador 1» → «J1» y «Ana Pérez» → «AP». Cortar a dos letras sin
 * mirar los espacios devolvía «JU» para TODOS los asientos sin nombre de una
 * mesa de puntuación, que es justo donde la ficha tiene que distinguir.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Qué representa la ficha: un asiento ocupado, un habitual por sentar, o el «+». */
export type SeatTokenVariant = "seat" | "regular" | "add";

/**
 * Ficha de asiento: el átomo visual de TODA pantalla de BiblioPlay donde se
 * eligen jugadores (los cuatro acompañantes y la mesa de puntuación). Círculo
 * tocable de 44px con su rótulo debajo.
 *
 * El rótulo lleva `w-full text-center truncate` por un fallo real: sin
 * centrarlo, un texto de dos palabras («Añadir jugador») se parte en dos
 * líneas dentro de la columna de 56px y las dos quedan pegadas a la izquierda,
 * descolgadas del círculo. Lo arrastraban Reloj, Recursos y Turnos.
 */
export function SeatToken({
  variant,
  seat = 0,
  caption,
  label,
  children,
  selected = false,
  disabled = false,
  expanded,
  controls,
  onClick,
}: {
  variant: SeatTokenVariant;
  /** Índice de asiento (solo en `variant="seat"`): decide el color. */
  seat?: number;
  /** Texto bajo el círculo. Se centra y se trunca a una línea. */
  caption: string;
  /** aria-label del botón: dice QUÉ pasa al tocarlo, no solo a quién. */
  label: string;
  /** Contenido del círculo. El «+» lo pone la propia ficha. */
  children?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  onClick: () => void;
}) {
  const filled = variant === "seat";
  return (
    <span className="flex w-14 flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={controls}
        title={caption}
        disabled={disabled}
        className={`flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-full font-semibold transition-all disabled:opacity-40 [touch-action:manipulation] ${
          filled
            ? "text-surface"
            : "border-2 border-dashed border-border text-muted-foreground"
        } ${variant === "regular" ? "opacity-70" : ""} ${
          variant === "add" ? "text-[18px]" : "text-[14px]"
        }`}
        style={
          filled
            ? {
                background: `var(${seatAccent(seat).varName})`,
                // Halo con hueco: un anillo pegado al círculo se pierde sobre
                // el asiento 1, que es del mismo terracota que el acento.
                ...(selected
                  ? { boxShadow: "0 0 0 2px var(--background), 0 0 0 4px var(--accent-ink)" }
                  : {}),
              }
            : undefined
        }
      >
        {variant === "add" ? (children ?? "+") : children}
      </button>
      <span className="w-full truncate text-center text-[10px] text-muted-foreground">
        {caption}
      </span>
    </span>
  );
}
