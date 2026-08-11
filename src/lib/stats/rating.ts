/**
 * Nota interna 1–10 → estrellas sobre 5. Cada punto interno es MEDIA estrella,
 * así que la conversión es exacta: 7 → 3,5 ★.
 *
 * Antes redondeaba hacia arriba a estrella entera (`ceil(r/2)`), y eso hacía
 * que el histograma y la media contaran cosas distintas: un 7 se dibujaba en la
 * columna de 4 ★ mientras la media —que sí divide entre 2— decía 3,5. Con dos
 * o tres notas impares, la barra más alta y la cifra grande de la misma tarjeta
 * discrepaban en medio punto y no había forma de saber cuál mentía.
 *
 * La escala visible tiene DIEZ peldaños, no cinco. Quien lo cambie a enteros
 * otra vez tiene que cambiar también la media, o vuelve el desajuste.
 */
export function toStar(rating: number): number {
  return Math.min(5, Math.max(0.5, rating / 2));
}

/** La nota en estrellas, escrita: "3,5". Un decimal siempre, para alinear ejes. */
export function starLabel(star: number): string {
  return star.toFixed(1).replace(".", ",");
}
