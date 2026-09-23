// TMDB con `language=es-ES` NO cae al inglés cuando una obra no tiene
// traducción al español: devuelve el `original_title` tal cual. Para el cine no
// europeo eso deja en el catálogo títulos que un hispanohablante no puede leer
// ("미쓰 홍당무", "Жмурки") y sinopsis vacías, cuando en en-US sí hay "Crush and
// Blush" / "Dead Man's Bluff" con su sinopsis. En prod, el 2026-09-23: 144
// películas y 46 series así.
//
// Regla decidida con el dueño: se cae al inglés SOLO si el título tiene letras
// fuera del alfabeto latino. Una francesa o una italiana sin traducir conservan
// su título original, que se lee sin problema.

// Una letra (cualquier alfabeto) que NO es latina. Los signos, los dígitos y los
// símbolos como "½" o "’" no cuentan: no son letras.
const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/u;

export function isHardToRead(title: string | null | undefined): boolean {
  return !!title && NON_LATIN_LETTER.test(title);
}

export type EnglishFallback = {
  title?: string | null;
  overview?: string | null;
};

/**
 * Título y sinopsis legibles a partir de la versión es-ES y (si la hay) la
 * en-US de la misma obra. El título inglés solo sustituye al español si este es
 * ilegible y el inglés no lo es; la sinopsis inglesa solo rellena una española
 * vacía.
 */
export function pickReadable(
  es: { title: string | null; synopsis: string | null },
  en: EnglishFallback | null | undefined
): { title: string | null; synopsis: string | null } {
  const enTitle = en?.title?.trim() || null;
  const title =
    isHardToRead(es.title) && enTitle && !isHardToRead(enTitle) ? enTitle : es.title;
  const synopsis = es.synopsis?.trim() || en?.overview?.trim() || null;
  return { title, synopsis };
}

/** ¿Merece la pena pedir la versión en-US de esta obra? */
export function needsEnglish(es: { title: string | null; synopsis: string | null }): boolean {
  return isHardToRead(es.title) || !es.synopsis?.trim();
}
