"use client";

import { useState } from "react";

// Cinco puntos que representan la nota 1–10 (cada punto = 2 puntos de la
// escala; medio punto = nota impar), estilo Letterboxd. Modo lectura o, si se
// pasa `onRate`, interactivo con precisión de medio punto (§7.36).
const FILL = "var(--type-series)";
const EMPTY = "var(--border)";

function dotBackground(rating: number, index: number): string {
  // index 0..4 → cubre notas (2i+1, 2i+2).
  const full = 2 * index + 2;
  const half = 2 * index + 1;
  if (rating >= full) return FILL;
  if (rating >= half) return `linear-gradient(90deg, ${FILL} 50%, ${EMPTY} 50%)`;
  return EMPTY;
}

export function EpisodeRating({
  rating,
  onRate,
  disabled = false,
  size = 12,
}: {
  rating: number | null;
  onRate?: (rating: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? rating ?? 0;
  const interactive = Boolean(onRate) && !disabled;

  return (
    <div
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setPreview(null)}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const value = (half: boolean) => 2 * i + (half ? 1 : 2);
        return (
          <span
            key={i}
            className="relative inline-block rounded-full"
            style={{
              width: size,
              height: size,
              background: dotBackground(shown, i),
              cursor: interactive ? "pointer" : "default",
            }}
            aria-hidden={!interactive}
          >
            {interactive && (
              <>
                <button
                  type="button"
                  className="absolute inset-y-0 left-0 w-1/2"
                  aria-label={`${value(true)}/10`}
                  onMouseEnter={() => setPreview(value(true))}
                  onClick={() => onRate!(value(true))}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 w-1/2"
                  aria-label={`${value(false)}/10`}
                  onMouseEnter={() => setPreview(value(false))}
                  onClick={() => onRate!(value(false))}
                />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
