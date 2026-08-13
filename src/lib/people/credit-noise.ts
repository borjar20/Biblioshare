import type { CreditRole } from "./types";

/**
 * Una aparición COMO SÍ MISMO no es un papel: es el making-of, el late night, el
 * concurso. TMDB las marca con una convención muy estable en `character`:
 * «Self», «Himself», «Self - Presenter», «Herself (archive footage)»…
 *
 * Medido en Phil Lord (tmdb 107446) el 2026-08-12: **13 de sus 18 créditos de
 * reparto** son «Self» —los making-of de Spider-Verse y LEGO (varios con CERO
 * votos), LEGO Masters, Late Night, The View, Jeopardy!—, mientras que su obra
 * real de intérprete («Additional Voices» en sus propias películas, «Principal
 * Dr. Cinnamon» en Clone High, «Bill») NO casa. El discriminante es limpio.
 *
 * `\b` tras la palabra a propósito: «Selfie» no es una aparición como sí mismo.
 */
const SELF_CHARACTER = /^\s*(self|himself|herself|themselves|themself)\b/i;

export function isSelfAppearance(character: string | null | undefined): boolean {
  return Boolean(character && SELF_CHARACTER.test(character));
}

// Cuánto pesa cada rol al elegir las DESTACADAS. La autoría manda sobre el
// reparto: en la ficha de un director, lo que se busca es su cine, no el cameo.
//
// POR QUÉ HACE FALTA: `pickFeatured` desempataba por «tu nota → nota global →
// año», y en un catálogo recién hidratado las DOS notas son null para todo, así
// que mandaba el AÑO — y los featurettes son lo más reciente. De ahí que los
// making-of se colaran por delante de su obra como director (queja del dueño,
// 2026-08-12).
const ROLE_WEIGHT: Record<CreditRole, number> = {
  director: 4,
  creator: 4,
  author: 4,
  writer: 3,
  cast: 2,
};

/**
 * Peso de una obra por el mejor de sus roles. Una aparición como sí mismo cae a
 * 0: si alguna quedó de antes de que se filtraran al hidratar, que no vuelva a
 * ganar la portada.
 */
export function workRoleWeight(
  roles: CreditRole[],
  character: string | null | undefined
): number {
  if (isSelfAppearance(character)) return 0;
  let best = 0;
  for (const role of roles) best = Math.max(best, ROLE_WEIGHT[role] ?? 0);
  return best;
}

/**
 * El rol MÁS FUERTE de una obra, para etiquetarla con él.
 *
 * No vale `roles[0]`: ese es el orden en que vinieron las filas de `credits`, y
 * daba etiquetas que contradecían a la propia pantalla — «Escuela de Clones»
 * salía DESTACADA (lo destaca su peso de creación) y debajo ponía «Reparto»,
 * porque el crédito de reparto entró primero.
 */
export function strongestRole(roles: CreditRole[]): CreditRole {
  let best: CreditRole = roles[0];
  for (const role of roles) {
    if ((ROLE_WEIGHT[role] ?? 0) > (ROLE_WEIGHT[best] ?? 0)) best = role;
  }
  return best;
}
