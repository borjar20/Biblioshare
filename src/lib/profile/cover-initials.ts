// Iniciales de una obra sin portada: solo letras («2001: Odisea» → «O»), el
// mismo criterio que el índice de sagas. Sin ninguna letra, el primer carácter
// visible; sin nada, «?».
export function coverInitials(title: string): string {
  const words = title.match(/\p{L}+/gu) ?? [];
  if (words.length > 0) {
    return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
  }
  const first = title.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}
