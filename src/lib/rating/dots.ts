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

// Nota 1–10 a partir de la posición del dedo sobre la fila de dots, como
// fracción 0–1 de su ancho. Vive aquí y no en el componente para poder probarla
// sin navegador: es la aritmética del gesto de arrastre táctil (F4-010), donde
// los targets reales medían 3,5px y la nota salía ±1 de la intención.
//
// El reparto es de DIEZ tramos iguales sobre todo el ancho, ignorando los `gap`
// entre dots: continuo y monótono, que es lo que pide un arrastre. Fuera de
// rango se recorta a 1 y a 10 — arrastrar más allá del borde no debe borrar la
// nota, y no existe el 0 (la ausencia de nota es `null`, no un cero).
export function ratingFromFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return 1;
  return Math.min(10, Math.max(1, Math.ceil(fraction * 10)));
}

// "4,5" para la nota 9. Es el número que acompaña a los dots (el "/5" lo pone
// quien lo pinta).
export function formatDots(rating: number | null): string | null {
  const dots = toDots(rating);
  if (dots === null) return null;
  return dots.toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

// Nota media de un grupo en la misma escala 1–10, redondeada a la media nota
// que los dots pueden pintar. Sin notas no hay media (null); con una sola, la
// «media» sería esa nota repetida, así que tampoco: la tarjeta que la usa
// (visionado conjunto) ya enseña la nota de cada miembro en su fila.
export function groupRating(ratings: (number | null)[]): number | null {
  const rated = ratings.filter((r): r is number => r !== null);
  if (rated.length < 2) return null;
  return Math.round(rated.reduce((a, b) => a + b, 0) / rated.length);
}
