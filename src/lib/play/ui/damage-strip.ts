/**
 * Qué fichas de daño de comandante caben en la tira de un panel. Lo que entra es lo
 * que da `commanderDamageBreakdown` (ya en orden de asiento y solo con daño > 0).
 *
 * La prioridad no es estética: **las letales siempre se ven**, porque son la
 * condición de derrota (21 de un mismo comandante) y esconderlas sería esconder
 * justo lo que decide la partida. El resto entra por orden de asiento y lo que sobra
 * se cuenta — nunca se descarta en silencio.
 *
 * Y lo visible sale en el ORDEN ORIGINAL, no en el de prioridad: si no, los números
 * bailarían de sitio entre toques.
 */
export type DamageRow = {
  commanderId: string;
  commanderName?: string;
  sourceId: string;
  amount: number;
  lethal: boolean;
};

export function fitDamageChips(
  rows: DamageRow[],
  capacity: number,
): { visible: DamageRow[]; overflow: number } {
  if (rows.length === 0) return { visible: [], overflow: 0 };

  const chosen = new Set<number>();
  rows.forEach((row, i) => {
    if (row.lethal) chosen.add(i);
  });
  for (let i = 0; i < rows.length && chosen.size < capacity; i++) {
    chosen.add(i);
  }

  const visible = rows.filter((_, i) => chosen.has(i));
  return { visible, overflow: rows.length - visible.length };
}
