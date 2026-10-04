// Saneado del término de búsqueda de seguidores antes de meterlo en un filtro
// `.or()` de PostgREST. Ahí `,` separa condiciones, `(` `)` agrupan, `.` separa
// campo/operador/valor, `*` y `%` son comodines, `\` y `"` escapan/entrecomillan,
// `_` es el comodín de un carácter de ilike. Se quitan todos: un username con
// punto o guion bajo se busca por el resto del texto.
export function sanitizeFollowerQuery(q: string): string {
  return q
    .replace(/[%_,().*\\"':;]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
