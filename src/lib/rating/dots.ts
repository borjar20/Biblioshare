// La nota se guarda 1–10 (smallint) y se enseña en 5 dots (cada dot = 2
// puntos; medio dot = nota impar). Este es el único módulo que conoce la
// equivalencia: nunca guardes dots.
//
// Se llamaba stars.ts: la app enseñaba estrellas y ahora enseña dots en todas
// partes (ver src/components/ui/rating-dots.tsx). `fromStars` se fue con el
// renombrado — no lo usaba nadie: RatingDots calcula el valor de cada mitad
// directamente (2i+1, 2i+2) y no necesita la inversa.
export function toDots(rating: number | null): number | null {
  return rating === null ? null : rating / 2;
}

// "4,5" para la nota 9. Es el número que acompaña a los dots (el "/5" lo pone
// quien lo pinta).
export function formatDots(rating: number | null): string | null {
  const dots = toDots(rating);
  if (dots === null) return null;
  return dots.toLocaleString("es-ES", { maximumFractionDigits: 1 });
}
