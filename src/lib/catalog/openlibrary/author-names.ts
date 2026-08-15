// Qué nombre de un autor de Open Library se le enseña a quien lee la app.
//
// No es una preferencia estética. El campo `name` de /authors/<key>.json es el
// canónico de OL y NO tiene por qué ser latino: Dostoyevski es "Фёдор
// Достоевский" y Homero es "Όμηρος". Enseñar eso en una app en castellano es
// enseñar un nombre ilegible.
//
// Y hace un segundo trabajo, más importante: un work de OL puede listar DOS
// veces al mismo humano en alfabetos distintos (Dune lista OL79034A "Frank
// Herbert" y OL7388009A "Френк Герберт"). El segundo es un stub sin
// `personal_name` ni `alternate_names`, así que no tiene ninguna forma latina y
// esta función lo descarta — que es justo como se corta ese duplicado.

export type OpenLibraryAuthorDetail = {
  name?: string;
  personal_name?: string;
  alternate_names?: string[];
};

const MAX_ALIASES = 20;

// Latino = tiene letras y, al quitarle todos los caracteres de escritura
// latina, no queda ninguna letra. Los signos y espacios no cuentan.
function isLatinScript(value: string): boolean {
  if (!/\p{L}/u.test(value)) return false;
  return !/\p{L}/u.test(value.replace(/\p{Script=Latin}/gu, ""));
}

// OL deja puntos pegados al final de algunos nombres ("Homer."). Se recortan,
// salvo cuando el nombre acaba en inicial ("Philip K. D."), donde el punto es
// parte del nombre.
function tidy(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (/\s\p{L}\.$/u.test(trimmed)) return trimmed;
  return trimmed.replace(/\.+$/, "");
}

/**
 * Devuelve el nombre visible y las demás grafías conocidas, o `null` si el
 * autor no tiene ninguna forma latina (en cuyo caso NO se crea la persona ni se
 * escribe su crédito).
 */
export function pickDisplayName(
  detail: OpenLibraryAuthorDetail
): { name: string; aliases: string[] } | null {
  const candidates = [
    detail.name,
    detail.personal_name,
    ...(detail.alternate_names ?? []),
  ]
    .filter((c): c is string => typeof c === "string")
    .map(tidy)
    .filter((c) => c.length > 0);

  // Deduplicado conservando el orden: el orden ES la preferencia (name antes
  // que personal_name, y este antes que los alternate_names).
  const unique = [...new Set(candidates)];
  const display = unique.find(isLatinScript);
  if (!display) return null;

  return {
    name: display,
    aliases: unique.filter((c) => c !== display).slice(0, MAX_ALIASES),
  };
}
