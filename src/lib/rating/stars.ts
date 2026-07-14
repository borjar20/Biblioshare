// La nota se guarda 1–10 (smallint) y se enseña 0,5–5 estrellas. Este es el
// único módulo que conoce la equivalencia: nunca guardes estrellas.
export function toStars(rating: number | null): number | null {
  return rating === null ? null : rating / 2;
}

export function fromStars(stars: number): number {
  const rating = Math.round(stars * 2);
  return Math.min(10, Math.max(1, rating));
}

export function formatStars(rating: number | null): string | null {
  const stars = toStars(rating);
  if (stars === null) return null;
  return stars.toLocaleString("es-ES", { maximumFractionDigits: 1 });
}
