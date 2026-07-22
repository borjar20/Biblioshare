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

// Nombres largos para la cabecera del calendario ("Julio 2026"). MONTHS_ES son
// las abreviaturas de las tarjetas de fecha; hacen falta las dos formas.
export const MONTHS_ES_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// month es "YYYY-MM". Se parte a mano por el mismo motivo que el resto del
// fichero: nada de new Date() sobre una fecha de la BD.
export function formatMonthYear(month: string): string {
  const [year, monthNumber] = month.split("-");
  return `${MONTHS_ES_LONG[Number(monthNumber) - 1] ?? ""} ${year}`;
}
