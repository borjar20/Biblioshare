// La hora de inicio llega por URL desde el cronómetro de la tarjeta de hoy
// (?inicio=<ISO>) igual que ?minutos=. Es texto de fuera: se acepta solo si es
// un instante válido, y se normaliza a ISO canónico (UTC) para el input oculto
// que la hoja envía como startedAt. Espejo de parseMinutes (load-context.ts).
export function parseStartedAt(raw: string | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
