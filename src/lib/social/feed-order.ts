// Clave de orden del feed: (día, created_at, id), descendente.
//
// Por qué el DÍA y no la fecha entera: las cuatro fuentes mezclan
// granularidades. Las altas traen un timestamptz ("2026-08-01T18:22:06+00:00")
// y las reseñas/episodios una columna `date` ("2026-08-01"). Comparando la
// cadena completa, la corta es prefijo de la larga y ordena SIEMPRE por debajo:
// una reseña de las 23:00 caía bajo un alta de las 00:01 del mismo día.
// Normalizando al día, el desempate lo hace `sortDate` (created_at), que
// siempre es un timestamp real.
//
// `id` cierra el orden total: sin él la paginación keyset no sería
// determinista entre eventos con el mismo día y la misma hora.
export type OrderableEntry = { eventDate: string; sortDate: string; id: string };

// `sortDate: null` marca un cursor del formato antiguo (`fecha~id`), emitido
// antes de este cambio y todavía vivo en una pestaña abierta durante el
// despliegue. Para esos se conserva la comparación antigua: es la única forma
// de no perder ni repetir filas en ese salto.
//
// `day` va SIEMPRE truncado a 10 caracteres porque alimenta `dateUpperBound`/
// `timestampUpperBound`, que a su vez alimentan filtros Postgres `date` y
// `timestamptz` — no pueden recibir un timestamp completo donde se espera una
// fecha. Pero la comparación legado en `isAfterCursor` necesita la cadena
// SIN truncar (la semántica que reproduce comparaba `eventDate` completo
// contra el cursor completo). Truncar antes de comparar iguala fechas que en
// la semántica antigua eran distintas y hace perder filas en silencio (ver
// test de regresión). Por eso se conserva aparte, sin tocar `day`.
export type FeedCursor = {
  day: string;
  sortDate: string | null;
  id: string;
  legacyFullDate: string | null;
};

const SEPARATOR = "~"; // no aparece ni en fechas ISO ni en los ids de evento

function dayOf(eventDate: string): string {
  return eventDate.slice(0, 10);
}

// Comparador descendente, apto para Array.prototype.sort.
export function compareEntries(a: OrderableEntry, b: OrderableEntry): number {
  const [da, db] = [dayOf(a.eventDate), dayOf(b.eventDate)];
  if (da !== db) return da < db ? 1 : -1;
  if (a.sortDate !== b.sortDate) return a.sortDate < b.sortDate ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function makeCursor(entry: OrderableEntry): string {
  return `${dayOf(entry.eventDate)}${SEPARATOR}${entry.sortDate}${SEPARATOR}${entry.id}`;
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
    // Camino legado: (eventDate completo, id), la comparación anterior al
    // cambio. Usa `legacyFullDate` (sin truncar) y NO `day`: `day` está
    // truncado a 10 caracteres para los cotas de Postgres, y comparar contra
    // la versión truncada iguala fechas que la semántica antigua distinguía.
    const legacyDate = cursor.legacyFullDate ?? cursor.day;
    if (entry.eventDate !== legacyDate) return entry.eventDate < legacyDate;
    return entry.id < cursor.id;
  }
  const day = dayOf(entry.eventDate);
  if (day !== cursor.day) return day < cursor.day;
  if (entry.sortDate !== cursor.sortDate) return entry.sortDate < cursor.sortDate;
  return entry.id < cursor.id;
}

// Cota superior INCLUSIVA para una columna `date`.
export function dateUpperBound(cursor: FeedCursor): string {
  return cursor.day;
}

// Cota superior INCLUSIVA para una columna `timestamptz`: cualquier hora de ese
// día debe entrar en el fetch; el descarte fino lo hace `isAfterCursor`.
export function timestampUpperBound(cursor: FeedCursor): string {
  return `${cursor.day}T23:59:59.999+00:00`;
}

// Cota superior INCLUSIVA para la fuente `added`, donde eventDate, sortDate y
// la columna filtrada son la MISMA (`created_at`).
//
// Vive aquí, pegada a `isAfterCursor`, porque es su espejo: toda cota tiene que
// ser un SUPERCONJUNTO de lo que el filtro acepta o la fila se pierde para
// siempre, y lo más estrecha posible o el `limit` se gasta en filas ya servidas.
//
// El supremo del conjunto aceptado es min(sortDate, fin del día del cursor), y
// las dos mitades importan:
//   · `sortDate` sola NO basta. `day` y `sortDate` salen de columnas distintas
//     en cuanto el último evento de una página está backdateado (una reseña
//     terminada hace tres semanas y registrada hoy: day=finished_on,
//     sortDate=created_at). Ahí `sortDate` es semanas MÁS ANCHA que el día:
//     la query devuelve las altas de hoy —ya servidas—, gasta el `limit` en
//     ellas, `fresh` se vacía, `nextCursor` se apaga y las altas antiguas no se
//     sirven en NINGUNA página. Sin excepción y sin romper ningún test.
//   · el fin del día solo tampoco: dentro del día del cursor, `isAfterCursor`
//     ya no acepta nada por encima de `sortDate`, así que traerlo es tirar el
//     `limit`.
// Cursor legado (`sortDate === null`): no hay hora, así que la cota es el día.
export function addedUpperBound(cursor: FeedCursor): string {
  const dayBound = timestampUpperBound(cursor);
  if (cursor.sortDate === null) return dayBound;
  return cursor.sortDate < dayBound ? cursor.sortDate : dayBound;
}
