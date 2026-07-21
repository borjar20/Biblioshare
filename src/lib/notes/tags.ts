// Normalización de etiquetas, compartida por los DOS escritores de notas
// (addNote desde la ficha, addSession desde la hoja). `meta` es jsonb opaco a
// la BD: si cada escritor normalizara por su cuenta, "Final" y "final" serían
// dos etiquetas distintas y el filtro del cuaderno (Plan B) no las juntaría
// nunca. Esta función es la única verdad sobre la forma de meta.tags.
const MAX_TAGS = 8;

export function normalizeTags(raw: string): string[] {
  const out: string[] = [];
  for (const piece of raw.split(",")) {
    const tag = piece
      .trim()
      .replace(/^#+/, "")       // el # es presentación, no dato
      .toLowerCase()
      .replace(/\s+/g, "-")     // "final feliz" → "final-feliz"
      .trim();
    if (!tag) continue;
    if (out.includes(tag)) continue;
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}
