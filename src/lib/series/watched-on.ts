// Fecha en que se vio un episodio (`episode_watches.watched_on`), en el
// calendario LOCAL de quien lo marca (fase 4 del rediseño de series).
//
// La columna tiene `default current_date`, que es la fecha UTC del servidor: un
// episodio marcado a la 01:00 en España caía en el día anterior. Da igual
// mientras nadie lea la fecha, pero desde la fase 4 las rachas, los calendarios
// y el post diario del feed cuentan por `watched_on`, igual que las sesiones de
// libro cuentan por `session_date` — que el cliente manda en su hora local. Así
// que el cliente manda también esta, y el servidor la valida aquí.
//
// Pura: `now` se inyecta para los tests.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

// Acepta una fecha `YYYY-MM-DD` válida y plausible; si no, null (el llamante
// deja que la columna ponga su default). «Plausible»: no más de un día por
// delante de la fecha UTC del servidor (los husos llegan a UTC+14) y no antes de
// 1990. Una server action es un endpoint POST público: la fecha no se cree a
// ciegas, pero tampoco hace falta más que acotarla — es dato del propio usuario.
export function parseWatchedOn(value: unknown, now: Date = new Date()): string | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  const tomorrowUtc = new Date(now.getTime() + DAY_MS).toISOString().slice(0, 10);
  if (value > tomorrowUtc || value < "1990-01-01") return null;
  return value;
}
