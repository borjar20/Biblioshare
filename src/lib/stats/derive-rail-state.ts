// Flags de visibilidad de la columna de estadísticas del Inicio. Puro para
// poder testear la tabla de casos sin base de datos. Regla: un bloque sin datos
// se OCULTA (no pinta 0s); la bienvenida solo mientras NINGUNO tiene datos.
// La racha es la VIVA (current), no la mejor histórica: con `best` un usuario
// que terminó algo el año pasado pero nada este año encendería el bloque de año
// y pintaría "0 completados".
export function deriveRailState(input: {
  weekMinutes: number;
  annualTotal: number;
  anyGoalSet: boolean;
  streakCurrent: number;
}): { showWeek: boolean; showYear: boolean; cold: boolean } {
  const showWeek = input.weekMinutes > 0;
  const showYear = input.annualTotal > 0 || input.anyGoalSet || input.streakCurrent > 0;
  return { showWeek, showYear, cold: !showWeek && !showYear };
}
