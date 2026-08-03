// Nota interna 1–10 → estrella 1–5 (cada estrella = 2 puntos): 1-2→1 … 9-10→5.
export function toStar(rating: number): number {
  return Math.min(5, Math.max(1, Math.ceil(rating / 2)));
}
