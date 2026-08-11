// Período de las vistas de estadísticas. Ya no es solo «un año o todo»: el
// esquema de paneles pide una ventana corta (semana, mes) además del año, y la
// misma escala sirve al muro de `/estadisticas` y a la pestaña del perfil.
//
//   "week"  → ventana MÓVIL de 7 días que termina hoy (no la semana natural:
//             es la misma que usa la tira semanal, y así los dos coinciden)
//   "month" → mes natural en curso
//   number  → año natural
//   "all"   → todo el histórico
//
// El selector vive en `?periodo=`. Cada consulta acota por los límites que da
// `periodBounds`; los paneles que son una foto del momento (estados, la pila,
// rachas) lo ignoran a propósito y lo declaran en su rótulo.

import { addDaysISO, toISODate } from "./dates";

export type StatsPeriod = "week" | "month" | "all" | number;

/** Los pills que se ofrecen, en orden. */
export function availablePeriods(now = new Date()): StatsPeriod[] {
  const year = now.getFullYear();
  return ["all" ,"week", "month", year, year - 1];
}

/** Los años sueltos. Sigue aquí porque los paneles anuales razonan en años. */
export function availableYears(now = new Date()): number[] {
  const year = now.getFullYear();
  return [year, year - 1];
}

/**
 * `?periodo=` → período. Lo ilegible cae en `fallback`, que cada vista fija a
 * lo suyo: el muro arranca en el año en curso y la pestaña del perfil en todo
 * el histórico, que es lo que enseñaba antes de tener selector.
 */
export function resolvePeriod(
  raw: string | undefined,
  now = new Date(),
  fallback: StatsPeriod = now.getFullYear(),
): StatsPeriod {
  if (raw === "semana") return "week";
  if (raw === "mes") return "month";
  if (raw === "todo") return "all";
  const n = Number(raw);
  if (Number.isInteger(n) && availableYears(now).includes(n)) return n;
  return fallback;
}

/** Período → `?periodo=`: el valor que lleva de vuelta a esta misma vista. */
export function periodParam(period: StatsPeriod): string {
  if (period === "week") return "semana";
  if (period === "month") return "mes";
  if (period === "all") return "todo";
  return String(period);
}

/** Etiqueta para el rótulo de cada panel: contesta «¿de cuándo me hablas?». */
export function periodLabel(period: StatsPeriod): string {
  if (period === "week") return "Últimos 7 días";
  if (period === "month") return "Este mes";
  if (period === "all") return "Todo el histórico";
  return String(period);
}

/** Etiqueta del pill. «Año» a secas no vale: en la fila hay dos años. */
export function periodPillLabel(period: StatsPeriod): string {
  if (period === "week") return "Semana";
  if (period === "month") return "Mes";
  if (period === "all") return "Todo";
  return String(period);
}

/** Límites [inicio, finExclusivo) del año como YYYY-MM-DD. */
export function yearBounds(year: number): { start: string; endExclusive: string } {
  return { start: `${year}-01-01`, endExclusive: `${year + 1}-01-01` };
}

/**
 * Límites [inicio, finExclusivo) del período, o `null` para «todo», que no
 * acota nada. Sirven igual para columnas `date` (`finished_on`,
 * `session_date`) que para `timestamptz` (`created_at`, `started_at`): la
 * comparación de cadenas ISO ordena bien en los dos casos.
 */
export function periodBounds(
  period: StatsPeriod,
  now = new Date(),
): { start: string; endExclusive: string } | null {
  if (period === "all") return null;
  if (typeof period === "number") return yearBounds(period);

  const today = toISODate(now);
  if (period === "week") {
    // Siete días CONTANDO hoy: de hoy-6 hasta mañana (exclusivo).
    return { start: addDaysISO(today, -6), endExclusive: addDaysISO(today, 1) };
  }
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${today.slice(0, 7)}-01`, endExclusive: `${next}-01` };
}

/**
 * El período INMEDIATAMENTE anterior, del mismo tamaño. Es lo que permite decir
 * «12 obras, 3 más que el mes pasado» sin inventarse la referencia. `null` para
 * «todo»: no hay un «antes de todo» con el que comparar.
 */
export function previousBounds(
  period: StatsPeriod,
  now = new Date(),
): { start: string; endExclusive: string } | null {
  if (period === "all") return null;
  if (typeof period === "number") return yearBounds(period - 1);

  const current = periodBounds(period, now);
  if (!current) return null;
  if (period === "week") {
    return { start: addDaysISO(current.start, -7), endExclusive: current.start };
  }
  const [y, m] = current.start.slice(0, 7).split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { start: `${prev}-01`, endExclusive: current.start };
}

/** Cómo nombrar al período anterior en la prosa del delta. */
export function previousLabel(period: StatsPeriod): string {
  if (period === "week") return "los 7 días anteriores";
  if (period === "month") return "el mes pasado";
  if (period === "all") return "";
  return String(period - 1);
}

/**
 * ¿Cae una fecha ISO (YYYY-MM-DD… o timestamptz) dentro del período? Para
 * filtrar en memoria lo que no se pudo acotar en SQL. «all» acepta todo,
 * incluido `null`.
 */
export function inPeriod(
  dateISO: string | null | undefined,
  period: StatsPeriod,
  now = new Date(),
): boolean {
  const bounds = periodBounds(period, now);
  if (!bounds) return true;
  if (!dateISO) return false;
  const date = dateISO.slice(0, 10);
  return date >= bounds.start && date < bounds.endExclusive;
}
