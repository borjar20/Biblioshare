// Colapso genérico de listas largas de chips (subsagas del índice, spec Fase
// 2): las primeras `max` se muestran, el resto se resume en un contador.
export function collapseSagaChildren<T>(
  items: T[],
  max: number,
): { visible: T[]; hiddenCount: number } {
  if (items.length <= max) return { visible: items, hiddenCount: 0 };
  return { visible: items.slice(0, max), hiddenCount: items.length - max };
}
