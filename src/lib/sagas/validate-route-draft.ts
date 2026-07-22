import type { RawRouteEntry } from "./route-types";

// Validación previa al guardado, en la línea de validate-graph-draft.
// Devuelve códigos de error (el consumidor los traduce), lista vacía = válido.
//
// NO valida que la ruta cubra todo el orden principal: una ruta PARCIAL
// («solo lo esencial») es justo el caso de uso. Eso es un aviso de UI, no un
// error de guardado.
export function validateRouteDraft(
  entries: RawRouteEntry[],
  ctx: { descendantIds: Set<string> },
): string[] {
  const errors = new Set<string>();

  const positions = entries.map((e) => e.position).sort((a, b) => a - b);
  if (positions.some((p, i) => p !== i + 1)) errors.add("positions");

  const seen = new Set<string>();
  for (const e of entries) {
    const isItem = e.itemType !== null && e.itemId !== null;
    const isBlock = e.childSagaId !== null;
    if (isItem === isBlock) {
      errors.add("xor");
      continue;
    }
    const key = isItem ? `i:${e.itemType}:${e.itemId}` : `s:${e.childSagaId}`;
    if (seen.has(key)) errors.add("duplicate");
    seen.add(key);

    if (isBlock && !ctx.descendantIds.has(e.childSagaId!)) errors.add("foreignBlock");
  }

  return [...errors];
}
