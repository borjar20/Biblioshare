// Formato compartido por view-models.ts y narrator-copy.ts (separado para que no
// se importen el uno al otro).

/** <1 h en minutos; <10 h con un decimal («1,6»); más, enteras. Un valor no finito no es un dato: se lee 0. */
export function formatHours(minutes: number): { value: string; unit: string } {
  const m = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  if (m < 60) return { value: String(m), unit: "min" };
  const h = m / 60;
  const value = new Intl.NumberFormat("es-ES", { maximumFractionDigits: h < 10 ? 1 : 0 }).format(h);
  return { value, unit: "h" };
}

/** Un cero de tiempo solo es una medida si no hay episodios cuya duración se desconoce. */
export type TimeKind = "measured" | "episodesOnly" | "none";
export function timeKind(minutes: number, episodesWithoutRuntime: number): TimeKind {
  if (Number.isFinite(minutes) && minutes > 0) return "measured";
  return episodesWithoutRuntime > 0 ? "episodesOnly" : "none";
}
