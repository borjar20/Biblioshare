"use client";

import { useState } from "react";
import { formatStars, toStars } from "@/lib/rating/stars";

// Cinco estrellas sobre la nota 1–10, con precisión de media estrella (mismo
// truco de mitades pulsables que EpisodeRating, ver src/components/detail/
// episode-rating.tsx). Recibe y devuelve SIEMPRE la escala 1–10: la
// conversión a estrellas es interna, ningún consumidor piensa en estrellas.
//
// Colores del mockup (.stars5 en Paper - Ficha de título completa.html):
// llenas en `text-gold`, vacías en `text-surface-muted`.
const SIZES = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
} as const;

function starFraction(stars: number, index: number): number {
  // index 0..4 -> estrella 1..5. Cuánto de esa estrella está llena (0, .5 o 1).
  return Math.min(1, Math.max(0, stars - index));
}

export function StarRating({
  value,
  onChange,
  size = "md",
  className = "",
}: {
  value: number | null;
  onChange?: (rating: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const interactive = Boolean(onChange);
  const shown = interactive ? (preview ?? value) : value;
  const shownStars = toStars(shown) ?? 0;

  const label =
    shown === null ? "Sin valorar" : `${formatStars(shown)} de 5 estrellas`;

  const stars = (
    <div
      className={`inline-flex items-center gap-0.5 ${SIZES[size]} ${className}`}
      onMouseLeave={interactive ? () => setPreview(null) : undefined}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const fraction = starFraction(shownStars, i);
        const halfValue = 2 * i + 1;
        const fullValue = 2 * i + 2;
        return (
          <span key={i} className="relative inline-block leading-none">
            <span aria-hidden="true" className="text-surface-muted">
              ★
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 overflow-hidden text-gold"
              style={{ width: `${fraction * 100}%` }}
            >
              ★
            </span>
            {interactive && (
              <>
                <button
                  type="button"
                  className="absolute inset-y-0 left-0 w-1/2"
                  aria-label={`${formatStars(halfValue)} de 5 estrellas`}
                  onMouseEnter={() => setPreview(halfValue)}
                  onFocus={() => setPreview(halfValue)}
                  onBlur={() => setPreview(null)}
                  onClick={() => onChange!(halfValue)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 w-1/2"
                  aria-label={`${formatStars(fullValue)} de 5 estrellas`}
                  onMouseEnter={() => setPreview(fullValue)}
                  onFocus={() => setPreview(fullValue)}
                  onBlur={() => setPreview(null)}
                  onClick={() => onChange!(fullValue)}
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
      <div role="img" aria-label={label}>
        {stars}
      </div>
    );
  }

  return (
    <div role="group" aria-label="Tu valoración">
      {stars}
    </div>
  );
}
