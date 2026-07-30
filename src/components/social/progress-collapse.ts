// Cuántas sesiones se ven cuando el grupo está colapsado.
export const PROGRESS_VISIBLE = 2;

// Un grupo se colapsa solo si esconde MÁS DE UNA sesión: con 3 se verían las 2
// primeras y un botón "ver 1 anterior" que no ahorra nada, así que el umbral
// es > PROGRESS_VISIBLE + 1 (4+). Expandido devuelve todo pero mantiene
// `collapsible` para poder pintar el "ver menos".
export function splitProgressSteps<T>(
  items: T[],
  expanded: boolean,
): { visible: T[]; hiddenCount: number; collapsible: boolean } {
  const collapsible = items.length > PROGRESS_VISIBLE + 1;
  if (!collapsible || expanded) {
    return { visible: items, hiddenCount: 0, collapsible };
  }
  return {
    visible: items.slice(0, PROGRESS_VISIBLE),
    hiddenCount: items.length - PROGRESS_VISIBLE,
    collapsible,
  };
}
