// Cuántas filas se ven cuando una tarjeta agrupada está colapsada. Compartido
// por el timeline de progreso y la tarjeta de Colección.
export const COLLAPSE_VISIBLE = 2;

// Una tarjeta se colapsa solo si esconde MÁS DE UNA fila: con 3 se verían las 2
// primeras y un botón "ver 1 más" que no ahorra nada, así que el umbral es
// > COLLAPSE_VISIBLE + 1 (4+). Expandida devuelve todo pero mantiene
// `collapsible` para poder pintar el "ver menos".
export function splitCollapsedItems<T>(
  items: T[],
  expanded: boolean,
): { visible: T[]; hiddenCount: number; collapsible: boolean } {
  const collapsible = items.length > COLLAPSE_VISIBLE + 1;
  if (!collapsible || expanded) {
    return { visible: items, hiddenCount: 0, collapsible };
  }
  return {
    visible: items.slice(0, COLLAPSE_VISIBLE),
    hiddenCount: items.length - COLLAPSE_VISIBLE,
    collapsible,
  };
}
