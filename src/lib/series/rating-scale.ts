// Escala discreta de 6 tramos para la nota de episodio (1–10), compartida por
// la rejilla y la leyenda (§7.36). Colores de dato (no tokens de tema):
// saturados y oscuros para leer con texto blanco en claro y oscuro.
export type RatingTier = { min: number; color: string; key: string };

export const RATING_TIERS: RatingTier[] = [
  { min: 9, color: "#166534", key: "awesome" },
  { min: 8, color: "#16a34a", key: "great" },
  { min: 7, color: "#4d7c0f", key: "good" },
  { min: 6, color: "#b45309", key: "regular" },
  { min: 4, color: "#b91c1c", key: "bad" },
  { min: 0, color: "#6d28d9", key: "garbage" },
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
