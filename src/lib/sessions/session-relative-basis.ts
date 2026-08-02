import { todayISO } from "@/lib/stats/dates";

// Sesiones backdateadas (session_date pasado — el formulario de registro lo
// permite a propósito, "se me olvidó registrar lo de anoche") no tienen una
// hora real que mostrar: se quedan en el nivel de precisión que sí es real,
// el día. Solo una sesión de HOY usa created_at, que es preciso porque nunca
// se edita a mano (a diferencia de session_date).
//
// …pero SOLO si ese timestamp está de verdad a un día o menos de la columna.
//
// Antes ese tope sostenía además las cotas del feed: el día del ORDEN salía de
// esta sustitución, así que una columna y un timestamp muy separados dejaban la
// fila fuera de la query en TODAS las páginas. Ya no: el feed ordena y pagina
// por la columna EN CRUDO (ver feed-order.ts), y esta función solo decide la
// base del «hace x» que se pinta en la tarjeta.
//
// Lo que el tope sigue protegiendo es esa coherencia de presentación: no
// inventar una hora para un evento lejano. El input de fecha de sesión es
// `type="date" required` SIN `max`, y no hay CHECK en la tabla: se puede
// registrar hoy una sesión fechada dentro de cinco días. Cuando ese día llega,
// `session_date === todayISO()` y sin la guarda la tarjeta enseñaría «hace cinco
// días» para algo fechado hoy.
//
// Por qué SIMÉTRICA: el desfase LEGÍTIMO que la sustitución debe tolerar —la
// columna es una fecha local y el timestamp es UTC— lo es: ±1 día, porque los
// husos van de UTC−12 a UTC+14 (en UTC+2, 00:30 local es 22:30Z del día
// anterior; en UTC−5, 23:30 local es 04:30Z del siguiente). Cualquier cosa más
// allá de ±1 día no es un huso: es una fecha inventada o un reloj roto, y un
// timestamp a días de la fecha que dice registrar no es una versión más precisa
// de esa fecha, es otro día.
//
// Un timestamp que ni siquiera se puede interpretar cae al mismo sitio que uno
// lejano: la columna.
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
