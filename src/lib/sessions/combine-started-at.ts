// Combina el input de fecha (sessionDate, "YYYY-MM-DD") con el nuevo input de
// hora opcional del registro manual ("HH:MM") en el mismo formato ISO que ya
// manda SessionTimer como startedAt (session-timer.tsx:134-140) — calculado
// aquí, en el cliente, nunca en el servidor: un string "YYYY-MM-DDTHH:MM" sin
// offset se interpreta como hora LOCAL, y el servidor podría estar en otro
// huso que el del usuario.
//
// time vacío (el caso por defecto: el usuario no ha tocado el campo) => null,
// nunca "ahora" — issue #252 prohíbe explícitamente inventar una hora.
export function combineStartedAt(sessionDate: string, time: string): string | null {
  if (!time || !sessionDate) return null;
  const parsed = new Date(`${sessionDate}T${time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
