// Formateo de fechas `date` de Postgres. Se parte la cadena a mano en vez de
// usar new Date(): un `date` no lleva zona, y pasarlo por Date lo interpreta
// como UTC y puede retroceder un día según dónde esté quien mira.
//
// Extraído del formatDue privado de club-summary.tsx al añadir los eventos
// (spec 2026-07-22): dos formateadores de la misma fecha acaban divergiendo.
export const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function formatDayMonth(iso: string): { day: string; month: string } {
  const [, month, day] = iso.split("-");
  return { day, month: MONTHS_ES[Number(month) - 1] ?? "" };
}

export function formatEventDate(iso: string): string {
  const { day, month } = formatDayMonth(iso);
  return `${day} ${month}`;
}
