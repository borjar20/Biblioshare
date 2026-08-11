"use client";

import { useState } from "react";
import { formatDots } from "@/lib/rating/dots";
import type { ItemType } from "@/lib/catalog/types";

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
// El relleno toma el color del TIPO de obra (--type-book/movie/series): la nota
// se lee dentro de la ficha o la tarjeta de un medio y se tiñe con su identidad.
// Antes era ORO fijo en toda la app (el color de tipo se reservaba para
// identificar el medio); se cambió a propósito — ver decisiones.md. Sin
// `itemType` cae a oro, para no dejar sin relleno un sitio que aún no lo pase.
const GOLD = "var(--gold)";
// El dot apagado va en --surface-3, no en --border: con el borde (alfa .14) no
// se distinguía del fondo y una nota de 2/10 parecía "sin valorar".
const EMPTY = "var(--surface-3)";

const SIZES = { sm: 7, md: 10, lg: 14 } as const;

function dotBackground(rating: number, index: number, fill: string): string {
  // index 0..4 → cubre las notas (2i+1, 2i+2).
  const full = 2 * index + 2;
  const half = 2 * index + 1;
  if (rating >= full) return fill;
  if (rating >= half)
    return `linear-gradient(90deg, ${fill} 50%, ${EMPTY} 50%)`;
  return EMPTY;
}

export function RatingDots({
  value,
  onChange,
  size = "md",
  disabled = false,
  className = "",
  itemType,
}: {
  /** Nota 1–10, o null si no hay. */
  value: number | null;
  /** Si se pasa, el control es interactivo (precisión de media nota). */
  onChange?: (rating: number) => void;
  size?: keyof typeof SIZES | number;
  disabled?: boolean;
  className?: string;
  /** Tiñe la nota con el color del tipo de obra. Sin él, oro. */
  itemType?: ItemType;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const interactive = Boolean(onChange) && !disabled;
  const shown = (interactive ? (preview ?? value) : value) ?? 0;
  const px = typeof size === "number" ? size : SIZES[size];
  const fill = itemType ? `var(--type-${itemType})` : GOLD;

  const dots = (
    <div
      className="inline-flex items-center gap-1"
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
              background: dotBackground(shown, i, fill),
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

  // `className` va SIEMPRE en el envoltorio de fuera, nunca en el div de los
  // dots: ese ya lleva `inline-flex`, y Tailwind emite `.inline-flex` después
  // de `.hidden`, así que un `hidden` del consumidor perdía la pelea. Por eso
  // el resumen de «Comunidad» pintaba diez dots en móvil — sus dos instancias
  // (`lg:hidden` y `hidden lg:flex`) se veían las dos a la vez.
  if (!interactive) {
    return (
      <div
        role="img"
        className={className || undefined}
        aria-label={
          value === null ? "Sin valorar" : `${formatDots(value)} de 5`
        }
      >
        {dots}
      </div>
    );
  }

  return (
    <div
      role="group"
      className={className || undefined}
      aria-label="Tu valoración"
    >
      {dots}
    </div>
  );
}
