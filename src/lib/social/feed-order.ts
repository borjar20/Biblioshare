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
//   thoughts   → thoughts.created_at          / thoughts.created_at
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

// El DÍA de la clave de orden. Una columna `date` pelada ("YYYY-MM-DD") no lleva
// zona: es ya el día natural y se usa tal cual. Un timestamp se lleva a su día
// UTC —NO al día del offset local—, porque el filtro SQL trata la columna
// timestamptz como instante y traduce el día del cursor a límites `+00:00`
// (`dayStart`/`nextDayStart`). Cortar la cadena daría el día local si el offset
// no fuese `+00:00` y rompería el espejo con SQL (#347). Nunca lanza: si el valor
// no parsea, cae al corte de cadena.
export function dayOf(value: string): string {
  if (value.length <= 10 || !value.includes("T")) return value.slice(0, 10);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value.slice(0, 10);
  return new Date(ms).toISOString().slice(0, 10);
}

// Compara dos `sortDate` por INSTANTE, no como cadenas: dos representaciones del
// mismo momento con distinto offset (`+02:00` vs `+00:00`) o precisión son
// iguales, y "20:00+02:00" (18:00Z) va ANTES que "19:00+00:00" (19:00Z) aunque
// como cadena parezca mayor. Espeja lo que hace Postgres en el filtro SQL. (#347)
function compareSortDate(a: string, b: string): number {
  if (a === b) return 0;
  const [ma, mb] = [Date.parse(a), Date.parse(b)];
  if (Number.isNaN(ma) || Number.isNaN(mb)) return a < b ? -1 : a > b ? 1 : 0;
  return ma - mb;
}

// Comparador descendente, apto para Array.prototype.sort.
export function compareEntries(a: OrderableEntry, b: OrderableEntry): number {
  const [da, db] = [dayOf(a.orderDate), dayOf(b.orderDate)];
  if (da !== db) return da < db ? 1 : -1;
  const s = compareSortDate(a.sortDate, b.sortDate);
  if (s !== 0) return s < 0 ? 1 : -1;
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
  const s = compareSortDate(entry.sortDate, cursor.sortDate);
  if (s !== 0) return s < 0;
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
  /**
   * Prefijo del id de EVENTO de esta fuente. El tercer componente de la clave
   * de orden es el id de evento (`diary_entries_added:<uuid>`), pero la columna
   * `id` guarda el uuid pelado: sin el prefijo no se puede traducir el
   * desempate a SQL. Termina en `:` y ninguno es prefijo de otro, así que
   * comparar dos prefijos equivale a comparar los ids completos que generan.
   */
  eventIdPrefix: string;
};

export type FeedSourceKey = "added" | "progressed" | "diary" | "episodes" | "clubs" | "thoughts";

// Único sitio donde vive el par de columnas de cada fuente: `feed.ts` construye
// sus queries con esto y los tests afirman contra lo mismo, de modo que no
// pueden separarse.
export const FEED_SOURCE_COLUMNS: Record<FeedSourceKey, FeedSourceColumns> = {
  added: {
    dateColumn: "created_at",
    stampColumn: "created_at",
    kind: "timestamptz",
    eventIdPrefix: "diary_entries_added:",
  },
  progressed: {
    dateColumn: "session_date",
    stampColumn: "created_at",
    kind: "date",
    eventIdPrefix: "progress_sessions:",
  },
  diary: {
    dateColumn: "finished_on",
    stampColumn: "updated_at",
    kind: "date",
    eventIdPrefix: "diary_entries:",
  },
  episodes: {
    dateColumn: "watched_on",
    stampColumn: "created_at",
    kind: "date",
    eventIdPrefix: "episode_watches:",
  },
  clubs: {
    dateColumn: "created_at",
    stampColumn: "created_at",
    kind: "timestamptz",
    eventIdPrefix: "club_activities:",
  },
  thoughts: {
    dateColumn: "created_at",
    stampColumn: "created_at",
    kind: "timestamptz",
    eventIdPrefix: "thoughts:",
  },
};

const KNOWN_EVENT_ID_PREFIXES = new Set(
  Object.values(FEED_SOURCE_COLUMNS).map((c) => c.eventIdPrefix),
);

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
/**
 * Qué hacer con el EMPATE EXACTO: las filas cuyo (día, hora) coincide con el
 * cursor. El desempate lo decide `id`, pero el id de la clave es el id de
 * EVENTO (`diary_entries_added:<uuid>`) y la columna guarda el uuid pelado.
 *
 *  - Si el cursor lo emitió ESTA fuente, el prefijo coincide y el uuid pelado
 *    se puede comparar contra la columna: `id.lt.<uuid>`. El empate se parte
 *    exactamente donde lo parte `isAfterCursor`.
 *  - Si lo emitió OTRA fuente, ningún id de esta fuente puede igualar al del
 *    cursor, y como los prefijos difieren, el prefijo YA decide el orden de
 *    TODAS sus filas a la vez: o el empate entero va después del cursor
 *    (`lte`, está por servir) o entero antes (`lt`, ya se sirvió). No hace
 *    falta cláusula de id: la cota de la hora basta.
 *  - Prefijo desconocido (un cursor de una fuente que aún no existía): cota
 *    inclusiva. Traer de más desperdicia `limit`; dejar de traer PIERDE filas,
 *    y la invariante que este filtro debe cumplir es ser superconjunto.
 */
function tieBound(
  columns: FeedSourceColumns,
  cursor: FeedCursor,
): { op: "lt" | "lte"; ownId: string | null } {
  const { eventIdPrefix } = columns;
  if (cursor.id.startsWith(eventIdPrefix)) {
    return { op: "lt", ownId: cursor.id.slice(eventIdPrefix.length) };
  }
  const cursorPrefix = cursor.id.slice(0, cursor.id.indexOf(":") + 1);
  if (!KNOWN_EVENT_ID_PREFIXES.has(cursorPrefix)) return { op: "lte", ownId: null };
  // Prefijo de esta fuente MENOR que el del cursor ⇒ todas sus filas empatadas
  // ordenan por DEBAJO del cursor ⇒ están por servir ⇒ cota inclusiva. Mayor ⇒
  // todas ya se sirvieron ⇒ cota estricta, y así el empate cruzado tampoco
  // gasta `limit`.
  return { op: eventIdPrefix < cursorPrefix ? "lte" : "lt", ownId: null };
}

export function cursorSourceFilter(columns: FeedSourceColumns, cursor: FeedCursor): string {
  const { dateColumn, stampColumn, kind } = columns;

  if (kind === "date") {
    // Cursor legado: no hay hora, así que lo único acotable es el día. Toda
    // fila que la comparación legada acepta (`orderDate < legacyFullDate` como
    // cadenas) tiene su día ≤ `cursor.day`, así que `lte` es superconjunto.
    if (cursor.sortDate === null) return `${dateColumn}.lte.${quoted(cursor.day)}`;
    const sameDay = `${dateColumn}.eq.${quoted(cursor.day)}`;
    const tie = tieBound(columns, cursor);
    const clauses = [
      `${dateColumn}.lt.${quoted(cursor.day)}`,
      `and(${sameDay},${stampColumn}.${tie.op}.${quoted(cursor.sortDate)})`,
    ];
    if (tie.ownId !== null) {
      clauses.push(
        `and(${sameDay},${stampColumn}.eq.${quoted(cursor.sortDate)},id.lt.${quoted(tie.ownId)})`,
      );
    }
    return clauses.join(",");
  }

  // timestamptz: el día del cursor se traduce a su intervalo de instantes.
  const dayStart = `${cursor.day}T00:00:00.000+00:00`;
  const nextDayStart = `${addDaysUTC(cursor.day, 1)}T00:00:00.000+00:00`;
  if (cursor.sortDate === null) return `${dateColumn}.lt.${quoted(nextDayStart)}`;

  // OJO: aquí NO se comparan `cursor.sortDate` y `dayStart` como cadenas. Son
  // de procedencias distintas —`sortDate` lo renderizó Postgres, `dayStart` lo
  // sintetiza esta función— y Postgres OMITE la fracción cuando es cero, así
  // que un `created_at` de medianoche exacta vuelve como "…T00:00:00+00:00":
  // en JS eso ordena POR DEBAJO de "…T00:00:00.000+00:00" ('+' 0x2B < '.' 0x2E)
  // siendo el MISMO instante. La rama del día desaparecía y toda fila con ese
  // instante se perdía en silencio, para siempre. Y no es una forma rara: los
  // pases importados por CSV llevan `created_at = finished_on`, o sea medianoche
  // exacta (`historicalCreatedAt`, src/lib/import/commit-row.ts).
  //
  // Lo que la rama significa es una relación entre DÍAS, así que se compara
  // entre días: dos cadenas "YYYY-MM-DD" de la misma forma. Los literales con
  // `.000` solo se ENVÍAN a Postgres, que los parsea como instantes.
  const stampDay = dayOf(cursor.sortDate);
  // `sortDate` en un día anterior al del cursor: dentro del día del cursor no
  // queda nada aceptable, solo los días anteriores. Pasa cuando el cursor viene
  // de otra fuente (un `finished_on` local con un `updated_at` UTC del día
  // anterior, p. ej.).
  if (stampDay < cursor.day) return `${dateColumn}.lt.${quoted(dayStart)}`;
  // Y por arriba hay que RECORTAR al día: si el cursor viene de una fila
  // backdateada, su `sortDate` puede ir semanas por delante del día y sin el
  // recorte el filtro traería filas de días ya servidos, gastaría el `limit` en
  // ellas y apagaría la paginación (el defecto original). En esa rama no hay
  // empate posible: una fila que igualase a `sortDate` caería fuera del día del
  // cursor, y ahí manda el día, no la hora.
  if (stampDay > cursor.day) {
    return (
      `${dateColumn}.lt.${quoted(dayStart)},` +
      `and(${dateColumn}.gte.${quoted(dayStart)},${stampColumn}.lt.${quoted(nextDayStart)})`
    );
  }
  const tie = tieBound(columns, cursor);
  const clauses = [
    `${dateColumn}.lt.${quoted(dayStart)}`,
    `and(${dateColumn}.gte.${quoted(dayStart)},${stampColumn}.${tie.op}.${quoted(cursor.sortDate)})`,
  ];
  if (tie.ownId !== null) {
    // `dateColumn === stampColumn` en esta rama, y `sortDate` está dentro del
    // día, así que la igualdad ya implica `gte dayStart`.
    clauses.push(`and(${stampColumn}.eq.${quoted(cursor.sortDate)},id.lt.${quoted(tie.ownId)})`);
  }
  return clauses.join(",");
}
