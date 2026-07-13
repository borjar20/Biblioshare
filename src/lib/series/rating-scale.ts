// Escala discreta de 6 tramos para la nota de episodio (1–10), compartida por
// la rejilla y la leyenda (§7.36). Son colores de dato, pero tematizados: cada
// tramo tiene variante clara y oscura en globals.css, y todos se leen contra
// --tier-foreground. Ojo: `var(--tier-*)`, no `var(--color-tier-*)` — @theme
// inline no emite las variables (misma trampa que en catalog/media-accent.ts).
export type RatingTier = { min: number; color: string; key: string };

export const RATING_TIERS: RatingTier[] = [
  { min: 9, color: "var(--tier-awesome)", key: "awesome" },
  { min: 8, color: "var(--tier-great)", key: "great" },
  { min: 7, color: "var(--tier-good)", key: "good" },
  { min: 6, color: "var(--tier-regular)", key: "regular" },
  { min: 4, color: "var(--tier-bad)", key: "bad" },
  { min: 0, color: "var(--tier-garbage)", key: "garbage" },
];

export function tierFor(rating: number): RatingTier {
  return RATING_TIERS.find((t) => rating >= t.min) ?? RATING_TIERS[RATING_TIERS.length - 1];
}

// Color de fondo para una celda con nota; null = sin nota (celda gris).
export function ratingColor(rating: number | null): string | null {
  return rating === null ? null : tierFor(rating).color;
}

// Media a un decimal de una lista de notas; null si no hay ninguna.
export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
}
