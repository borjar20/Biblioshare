"use client";

import { useState } from "react";
import { formatDots } from "@/lib/rating/dots";

// EL control de valoración de Paper: cinco dots sobre la nota 1–10, en modo
// lectura o interactivo. Único en la app — no hay estrellas en ninguna parte.
//
// Cada dot vale DOS puntos de la escala y un dot a medias es la nota impar
// (estilo Letterboxd): así caben las diez notas en los cinco dots de la
// maqueta, sin bajar la nota a una escala de 5 ni alinear diez dots en fila.
// La técnica (medio relleno con un degradado duro al 50%, mitades pulsables)
// venía de EpisodeRating, que era el único sitio que ya la tenía bien; ahora
// vive aquí y aquel la reutiliza.
//
// Recibe y devuelve SIEMPRE 1–10: la conversión a /5 es interna y de
// presentación, igual que hacía el StarRating al que jubila. Ningún consumidor
// piensa en dots.
//
// El relleno es ORO, no el acento del tipo de medio: en Paper la valoración es
// oro en todas partes y el color de tipo se reserva para identificar el medio.

const FILL = "var(--gold)";
// El dot apagado va en --surface-3, no en --border: con el borde (alfa .14) no
// se distinguía del fondo y una nota de 2/10 parecía "sin valorar".
const EMPTY = "var(--surface-3)";

const SIZES = { sm: 7, md: 10, lg: 14 } as const;

function dotBackground(rating: number, index: number): string {
  // index 0..4 → cubre las notas (2i+1, 2i+2).
  const full = 2 * index + 2;
  const half = 2 * index + 1;
  if (rating >= full) return FILL;
  if (rating >= half)
    return `linear-gradient(90deg, ${FILL} 50%, ${EMPTY} 50%)`;
  return EMPTY;
}

export function RatingDots({
  value,
  onChange,
  size = "md",
  disabled = false,
  className = "",
}: {
  /** Nota 1–10, o null si no hay. */
  value: number | null;
  /** Si se pasa, el control es interactivo (precisión de media nota). */
  onChange?: (rating: number) => void;
  size?: keyof typeof SIZES | number;
  disabled?: boolean;
  className?: string;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const interactive = Boolean(onChange) && !disabled;
  const shown = (interactive ? (preview ?? value) : value) ?? 0;
  const px = typeof size === "number" ? size : SIZES[size];

  const dots = (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      onMouseLeave={interactive ? () => setPreview(null) : undefined}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const valueAt = (half: boolean) => 2 * i + (half ? 1 : 2);
        return (
          <span
            key={i}
            className="relative inline-block rounded-full"
            style={{
              width: px,
              height: px,
              background: dotBackground(shown, i),
              cursor: interactive ? "pointer" : "default",
            }}
            aria-hidden={!interactive}
          >
            {interactive && (
              <>
                {/* Mitades pulsables: izquierda = nota impar, derecha = par.
                    Son <button> de verdad (no un onClick sobre el dot) para
                    que el control se pueda tabular y usar con teclado. */}
                <button
                  type="button"
                  className="absolute inset-y-0 left-0 w-1/2"
                  aria-label={`${valueAt(true)}/10`}
                  onMouseEnter={() => setPreview(valueAt(true))}
                  onFocus={() => setPreview(valueAt(true))}
                  onBlur={() => setPreview(null)}
                  onClick={() => onChange!(valueAt(true))}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 w-1/2"
                  aria-label={`${valueAt(false)}/10`}
                  onMouseEnter={() => setPreview(valueAt(false))}
                  onFocus={() => setPreview(valueAt(false))}
                  onBlur={() => setPreview(null)}
                  onClick={() => onChange!(valueAt(false))}
                />
              </>
            )}
          </span>
        );
      })}
    </div>
  );

  if (!interactive) {
    return (
      <div
        role="img"
        aria-label={
          value === null ? "Sin valorar" : `${formatDots(value)} de 5`
        }
      >
        {dots}
      </div>
    );
  }

  return (
    <div role="group" aria-label="Tu valoración">
      {dots}
    </div>
  );
}
