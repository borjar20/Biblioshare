// Período de la página de estadísticas completas (frame J, P9): un año natural
// o "all" (el pill "Todo"). El selector vive en `?periodo=`, y cada consulta del
// muro acota por el año cuando no es "all". Por defecto "all", que es justo el
// comportamiento histórico de las consultas de la pestaña (B/G) — así reusarlas
// sin período no cambia nada.
export type StatsPeriod = number | "all";

// Los pills que ofrece la página: el año en curso, el anterior y "Todo" (como el
// mockup, 2026 / 2025 / Todo). No se derivan del dato para no meter una consulta
// extra solo para pintar el selector.
export function availableYears(now = new Date()): number[] {
  const year = now.getFullYear();
  return [year, year - 1];
}

// `?periodo=` → período. "todo" (o vacío/ilegible) cae en "all"; un año de los
// ofrecidos se respeta; cualquier otra cosa cae en el año en curso.
export function resolvePeriod(raw: string | undefined, now = new Date()): StatsPeriod {
  if (raw === "todo") return "all";
  const years = availableYears(now);
  const n = Number(raw);
  if (Number.isInteger(n) && years.includes(n)) return n;
  return now.getFullYear();
}

// Período → `?periodo=`: el valor que lleva de vuelta a esta misma vista.
export function periodParam(period: StatsPeriod): string {
  return period === "all" ? "todo" : String(period);
}

// Límites [inicio, finExclusivo) del año como YYYY-MM-DD. Sirven igual para
// columnas `date` (finished_on, session_date) que para timestamptz (created_at,
// started_at): la comparación de cadenas ISO ordena bien en ambos casos.
export function yearBounds(year: number): { start: string; endExclusive: string } {
  return { start: `${year}-01-01`, endExclusive: `${year + 1}-01-01` };
}

// ¿Cae una fecha ISO (YYYY-MM-DD… o timestamptz) dentro del período? "all" acepta
// todo. Para filtrar en memoria lo que no se pudo acotar en SQL.
export function inPeriod(dateISO: string | null | undefined, period: StatsPeriod): boolean {
  if (period === "all") return true;
  if (!dateISO) return false;
  return dateISO.slice(0, 4) === String(period);
}
