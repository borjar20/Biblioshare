// Clave de orden del feed: (día de `orderDate`, `sortDate`, `id`), descendente.
//
// `orderDate` es LA COLUMNA DE FECHA DE LA FUENTE, en crudo — no una fecha
// derivada en JavaScript. Ese es el cambio que cierra #346 y la clase de fallo
// que produjo seis defectos: Postgres no puede ordenar ni paginar por un valor
// que no existe en ninguna columna, así que mientras el día del orden salía de
// `sessionRelativeBasis(columna, timestamp)` la cota de cada query no podía
// corresponderse con `isAfterCursor` — solo aproximarse, con un helper de
// compensación por cada forma de desajuste.
//
// Por fuente, el par (columna de fecha, timestamp de registro):
//   added      → passes.created_at            / passes.created_at
//   progressed → progress_sessions.session_date / progress_sessions.created_at
//   diary      → passes.finished_on           / passes.updated_at
//   episodes   → episode_watches.watched_on   / episode_watches.created_at
//   clubs      → club_activities.created_at   / club_activities.created_at
//
// Por qué el DÍA y no la fecha entera: las cinco fuentes mezclan granularidades.
// Las altas y los clubes traen un timestamptz ("2026-08-01T18:22:06+00:00") y
// las reseñas/episodios/sesiones una columna `date` ("2026-08-01"). Comparando
// la cadena completa, la corta es prefijo de la larga y ordena SIEMPRE por
// debajo: una reseña de las 23:00 caería bajo un alta de las 00:01 del mismo
// día. Normalizando al día, el desempate lo hace `sortDate`, que siempre es un
// timestamp real.
//
// `id` cierra el orden total: sin él la paginación keyset no sería determinista
// entre eventos con el mismo día y la misma hora.
//
// `eventDate` (la fecha semántica, con la sustitución de `sessionRelativeBasis`)
// YA NO participa en el orden: queda solo para presentación —el «hace x» de la
// tarjeta— y para la ventana de agrupación.
export type OrderableEntry = { orderDate: string; sortDate: string; id: string };

// `sortDate: null` marca un cursor del formato antiguo (`fecha~id`), emitido
// antes de este cambio y todavía vivo en una pestaña abierta durante el
// despliegue. Para esos se conserva la comparación antigua: es la única forma
// de no perder ni repetir filas en ese salto.
//
// `day` va SIEMPRE truncado a 10 caracteres porque alimenta los filtros de
// query, que comparan contra columnas `date`. Pero la comparación legado en
// `isAfterCursor` necesita la cadena SIN truncar (la semántica que reproduce
// comparaba la fecha completa contra el cursor completo). Truncar antes de
// comparar iguala fechas que en la semántica antigua eran distintas y hace
// perder filas en silencio (ver test de regresión). Por eso se conserva aparte,
// sin tocar `day`.
export type FeedCursor = {
  day: string;
  sortDate: string | null;
  id: string;
  legacyFullDate: string | null;
};

const SEPARATOR = "~"; // no aparece ni en fechas ISO ni en los ids de evento

export function dayOf(eventDate: string): string {
  return eventDate.slice(0, 10);
}

// Comparador descendente, apto para Array.prototype.sort.
export function compareEntries(a: OrderableEntry, b: OrderableEntry): number {
  const [da, db] = [dayOf(a.orderDate), dayOf(b.orderDate)];
  if (da !== db) return da < db ? 1 : -1;
  if (a.sortDate !== b.sortDate) return a.sortDate < b.sortDate ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function makeCursor(entry: OrderableEntry): string {
  return `${dayOf(entry.orderDate)}${SEPARATOR}${entry.sortDate}${SEPARATOR}${entry.id}`;
}

export function parseCursor(cursor: string): FeedCursor {
  const parts = cursor.split(SEPARATOR);
  // Los ids de evento no llevan `~`, pero unir el resto es gratis y evita que
  // un id inesperado trunque el cursor en silencio.
  if (parts.length >= 3) {
    return {
      day: parts[0],
      sortDate: parts[1],
      id: parts.slice(2).join(SEPARATOR),
      legacyFullDate: null,
    };
  }
  if (parts.length === 2) {
    return { day: dayOf(parts[0]), sortDate: null, id: parts[1], legacyFullDate: parts[0] };
  }
  return { day: dayOf(cursor), sortDate: null, id: "", legacyFullDate: cursor };
}

// ¿Va `entry` estrictamente DESPUÉS del cursor en el orden total? Lo ya
// servido —incluido el propio evento del cursor— queda fuera. Espeja a
// `compareEntries`: si dejan de coincidir, la paginación pierde o repite filas.
export function isAfterCursor(entry: OrderableEntry, cursor: FeedCursor): boolean {
  if (cursor.sortDate === null) {
    // Camino legado: (fecha completa, id), la comparación anterior al cambio.
    // Usa `legacyFullDate` (sin truncar) y NO `day`: `day` está truncado a 10
    // caracteres para los filtros de Postgres, y comparar contra la versión
    // truncada iguala fechas que la semántica antigua distinguía.
    const legacyDate = cursor.legacyFullDate ?? cursor.day;
    if (entry.orderDate !== legacyDate) return entry.orderDate < legacyDate;
    return entry.id < cursor.id;
  }
  const day = dayOf(entry.orderDate);
  if (day !== cursor.day) return day < cursor.day;
  if (entry.sortDate !== cursor.sortDate) return entry.sortDate < cursor.sortDate;
  return entry.id < cursor.id;
}

// Suma días de calendario a una fecha "YYYY-MM-DD". UTC explícito y sin leer el
// reloj: este módulo es puro (ver los tests que lo fijan).
function addDaysUTC(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return day;
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// --- El filtro de query, espejo exacto de `isAfterCursor` ---------------------

export type FeedSourceColumns = {
  /** Columna de fecha de la fuente: de ella sale el DÍA de la clave de orden. */
  dateColumn: string;
  /** Columna de la hora de registro: el segundo componente de la clave. */
  stampColumn: string;
  /**
   * `date`        → la columna ES el día, así que el día se compara directo.
   * `timestamptz` → el día hay que acotarlo por instantes. Solo se usa donde
   *                 `dateColumn === stampColumn` (altas y clubes), que es lo
   *                 que permite colapsar «mismo día Y hora ≤ cursor» en un
   *                 único intervalo sobre esa columna.
   */
  kind: "date" | "timestamptz";
};

export type FeedSourceKey = "added" | "progressed" | "diary" | "episodes" | "clubs";

// Único sitio donde vive el par de columnas de cada fuente: `feed.ts` construye
// sus queries con esto y los tests afirman contra lo mismo, de modo que no
// pueden separarse.
export const FEED_SOURCE_COLUMNS: Record<FeedSourceKey, FeedSourceColumns> = {
  added: { dateColumn: "created_at", stampColumn: "created_at", kind: "timestamptz" },
  progressed: { dateColumn: "session_date", stampColumn: "created_at", kind: "date" },
  diary: { dateColumn: "finished_on", stampColumn: "updated_at", kind: "date" },
  episodes: { dateColumn: "watched_on", stampColumn: "created_at", kind: "date" },
  clubs: { dateColumn: "created_at", stampColumn: "created_at", kind: "timestamptz" },
};

// Los valores van entre comillas dobles: dentro de un `or=(...)` de PostgREST,
// `,` `.` `:` `(` `)` son estructurales y un timestamp los lleva. Mismo patrón
// que ya usa `listNotifications` en producción.
function quoted(value: string): string {
  return `"${value}"`;
}

/**
 * Filtro PostgREST —para pasar a `.or()`— que acepta EXACTAMENTE las filas que
 * `isAfterCursor` acepta, expresado sobre las columnas reales de la fuente.
 *
 * Es la mitad SQL de una sola invariante: si este filtro y `isAfterCursor` dejan
 * de coincidir, la paginación pierde o repite filas sin lanzar, sin error de
 * tipos y sin romper ningún test que no sea el del recorrido completo. Por eso
 * viven pegados, en el mismo módulo puro.
 *
 * Cota inclusiva en el borde a propósito: el descarte fino —el propio evento del
 * cursor— lo sigue haciendo `isAfterCursor` en cliente.
 */
export function cursorSourceFilter(columns: FeedSourceColumns, cursor: FeedCursor): string {
  const { dateColumn, stampColumn, kind } = columns;

  if (kind === "date") {
    // Cursor legado: no hay hora, así que lo único acotable es el día. Toda
    // fila que la comparación legada acepta (`orderDate < legacyFullDate` como
    // cadenas) tiene su día ≤ `cursor.day`, así que `lte` es superconjunto.
    if (cursor.sortDate === null) return `${dateColumn}.lte.${quoted(cursor.day)}`;
    return (
      `${dateColumn}.lt.${quoted(cursor.day)},` +
      `and(${dateColumn}.eq.${quoted(cursor.day)},${stampColumn}.lte.${quoted(cursor.sortDate)})`
    );
  }

  // timestamptz: el día del cursor se traduce a su intervalo de instantes.
  const dayStart = `${cursor.day}T00:00:00.000+00:00`;
  const nextDayStart = `${addDaysUTC(cursor.day, 1)}T00:00:00.000+00:00`;
  if (cursor.sortDate === null) return `${dateColumn}.lt.${quoted(nextDayStart)}`;
  // `sortDate` por debajo del arranque del día del cursor: dentro de ese día no
  // queda nada aceptable, solo los días anteriores. Pasa cuando el cursor viene
  // de otra fuente (un `finished_on` local con un `updated_at` UTC del día
  // anterior, p. ej.).
  if (cursor.sortDate < dayStart) return `${dateColumn}.lt.${quoted(dayStart)}`;
  // Y por arriba hay que RECORTAR al día: si el cursor viene de una fila
  // backdateada, su `sortDate` puede ir semanas por delante del día y sin el
  // recorte el filtro traería filas de días ya servidos, gastaría el `limit` en
  // ellas y apagaría la paginación (el defecto original).
  const upper =
    cursor.sortDate < nextDayStart
      ? `${stampColumn}.lte.${quoted(cursor.sortDate)}`
      : `${stampColumn}.lt.${quoted(nextDayStart)}`;
  return (
    `${dateColumn}.lt.${quoted(dayStart)},` +
    `and(${dateColumn}.gte.${quoted(dayStart)},${upper})`
  );
}
