export type RouteCounts = { steps: number; notes: number };

/** Fila mínima de `saga_route_entries` que hace falta para contar. Se nombran
 *  las columnas en snake_case porque llegan crudas de Supabase: mapearlas a
 *  camelCase solo para contarlas sería una vuelta de más. */
export type RawRouteEntryCountRow = { route_id: string; note: string | null };

/**
 * Pasos y notas por itinerario, en una pasada.
 *
 * Una ruta sin ninguna fila NO aparece en el resultado (el llamador resuelve
 * con `?? { steps: 0, notes: 0 }`): esta función no recibe la lista de rutas,
 * así que no puede distinguir «existe y está vacía» de «no existe».
 *
 * Una nota en blanco no cuenta. La columna admite '' aunque el editor guarde
 * null al vaciarla, y un «3 notas» con tres cadenas vacías sería mentira.
 */
export function countRouteEntries(rows: RawRouteEntryCountRow[]): Record<string, RouteCounts> {
  const out: Record<string, RouteCounts> = {};
  for (const row of rows) {
    const counts = (out[row.route_id] ??= { steps: 0, notes: 0 });
    counts.steps += 1;
    if (row.note !== null && row.note.trim() !== "") counts.notes += 1;
  }
  return out;
}
