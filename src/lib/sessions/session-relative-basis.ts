import { todayISO } from "@/lib/stats/dates";

// Sesiones backdateadas (session_date pasado — el formulario de registro lo
// permite a propósito, "se me olvidó registrar lo de anoche") no tienen una
// hora real que mostrar: se quedan en el nivel de precisión que sí es real,
// el día. Solo una sesión de HOY usa created_at, que es preciso porque nunca
// se edita a mano (a diferencia de session_date).
//
// …pero SOLO si ese timestamp está de verdad a un día o menos de la columna.
// Ese tope no es cosmético: es lo que sostiene las cotas del feed.
//
// Las tres fuentes de fecha-only del feed (session_date, finished_on,
// watched_on) ordenan por `dayOf(sessionRelativeBasis(columna, timestamp))` y
// filtran con `lte(columna, cursor.day + 1)` (ver
// `dateUpperBoundInclusiveOfUtcSkew` en feed-order.ts). Esa cota es un
// superconjunto de lo que acepta `isAfterCursor` únicamente mientras la columna
// no se separe del día de orden en más de un día; si se separa más, la fila
// queda fuera de la query en TODAS las páginas y desaparece del feed sin
// romper ningún tipo — y por el camino de `fresh` vacío → `nextCursor: null`
// puede además truncar el feed entero.
//
// Sin esta guarda la premisa no la garantizaba nadie. El input de fecha de
// sesión es `type="date" required` SIN `max`, y no hay CHECK en la tabla: se
// puede registrar hoy una sesión fechada dentro de cinco días. Cuando ese día
// llega, `session_date === todayISO()` y la sustitución metía un created_at de
// hace cinco días como día de orden — cinco días POR DEBAJO de la columna.
//
// Por qué SIMÉTRICA y no solo hacia el pasado: lo que rompe la cota `lte` es
// únicamente el lado "timestamp anterior a la columna" (el día de orden cae por
// debajo de la columna y la cota, que sube desde el día del cursor, no la
// alcanza). Pero el desfase LEGÍTIMO que la sustitución debe seguir tolerando
// —la columna es una fecha local y el timestamp es UTC— es simétrico: ±1 día,
// porque los husos van de UTC−12 a UTC+14 (en UTC+2, 00:30 local es 22:30Z del
// día anterior; en UTC−5, 23:30 local es 04:30Z del siguiente). Cualquier cosa
// más allá de ±1 día no es un huso: es una fecha inventada o un reloj roto, y
// un timestamp a días de la fecha que dice registrar no es una versión más
// precisa de esa fecha, es otro día. Rechazarlo también por arriba no cuesta
// ningún caso real, mantiene el invariante "el día de orden nunca se separa más
// de un día de la columna" cierto en ambos sentidos, y evita que un created_at
// futuro clave el evento en lo alto del feed para siempre.
//
// Un timestamp que ni siquiera se puede interpretar cae al mismo sitio que uno
// lejano: la columna. Un día de orden ilegible es exactamente lo que estas
// cotas no pueden acotar.
const DAY_MS = 86_400_000;

// Día UTC como entero (días desde epoch). Sin leer el reloj: `Date.parse`
// interpreta "YYYY-MM-DD" como medianoche UTC y un ISO con offset como el
// instante que denota, que es justo lo que hay que comparar.
function utcDayIndex(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : Math.floor(ms / DAY_MS);
}

export function sessionRelativeBasis(
  sessionDate: string,
  createdAt: string,
  today: string = todayISO(),
): string {
  if (sessionDate !== today) return sessionDate;
  const dateDay = utcDayIndex(sessionDate);
  const stampDay = utcDayIndex(createdAt);
  if (dateDay === null || stampDay === null) return sessionDate;
  if (Math.abs(stampDay - dateDay) > 1) return sessionDate;
  return createdAt;
}
