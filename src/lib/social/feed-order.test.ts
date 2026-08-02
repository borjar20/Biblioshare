import { describe, expect, it } from "vitest";
import {
  compareEntries,
  cursorSourceFilter,
  dayOf,
  FEED_SOURCE_COLUMNS,
  isAfterCursor,
  makeCursor,
  parseCursor,
  type FeedCursor,
  type FeedSourceKey,
  type OrderableEntry,
} from "./feed-order";
import { rowMatchesOrFilter, type FakeRow } from "./fake-feed-supabase";

// Un alta de las 00:01 y una reseña de las 23:00, ambas del mismo día. La
// reseña tiene `orderDate` date-only (finished_on es una columna `date`), que es
// justo lo que antes la hundía por debajo del alta.
const alta: OrderableEntry = {
  orderDate: "2026-08-01T00:01:00.000+00:00",
  sortDate: "2026-08-01T00:01:00.000+00:00",
  id: "passes:aaa",
};
const resena: OrderableEntry = {
  orderDate: "2026-08-01",
  sortDate: "2026-08-01T23:00:00.000+00:00",
  id: "diary_entries:bbb",
};

describe("compareEntries", () => {
  it("ordena por hora real dentro del día, no por granularidad de la fecha", () => {
    expect([alta, resena].sort(compareEntries)).toEqual([resena, alta]);
  });

  it("ordena por día antes que por hora", () => {
    const ayer: OrderableEntry = {
      orderDate: "2026-07-31",
      sortDate: "2026-07-31T23:59:00.000+00:00",
      id: "diary_entries:ccc",
    };
    expect([ayer, alta].sort(compareEntries)).toEqual([alta, ayer]);
  });

  it("desempata por id cuando día y hora coinciden", () => {
    const a = { ...alta, id: "passes:aaa" };
    const b = { ...alta, id: "passes:zzz" };
    expect([a, b].sort(compareEntries)).toEqual([b, a]);
  });
});

describe("cursor", () => {
  it("un cursor nuevo lleva día, hora e id", () => {
    expect(makeCursor(resena)).toBe(
      "2026-08-01~2026-08-01T23:00:00.000+00:00~diary_entries:bbb",
    );
  });

  it("parsea el cursor nuevo conservando los ids con separadores raros", () => {
    expect(parseCursor("2026-08-01~2026-08-01T23:00:00.000+00:00~x~y")).toEqual({
      day: "2026-08-01",
      sortDate: "2026-08-01T23:00:00.000+00:00",
      id: "x~y",
      legacyFullDate: null,
    });
  });

  it("un cursor legado (fecha~id) se marca sin hora, para no perder filas", () => {
    expect(parseCursor("2026-08-01~diary_entries:bbb")).toEqual({
      day: "2026-08-01",
      sortDate: null,
      id: "diary_entries:bbb",
      legacyFullDate: "2026-08-01",
    });
  });
});

describe("isAfterCursor", () => {
  it("excluye el propio evento del cursor", () => {
    expect(isAfterCursor(resena, parseCursor(makeCursor(resena)))).toBe(false);
  });

  it("incluye lo que va estrictamente después en el orden total", () => {
    expect(isAfterCursor(alta, parseCursor(makeCursor(resena)))).toBe(true);
  });

  it("excluye lo que va antes", () => {
    expect(isAfterCursor(resena, parseCursor(makeCursor(alta)))).toBe(false);
  });

  it("un cursor legado usa la comparación antigua (fecha, id): no pierde ni repite", () => {
    const legado = parseCursor("2026-08-01~passes:aaa");
    // Con la semántica antigua, "2026-08-01" < "2026-08-01T00:01..." como
    // cadena, así que la reseña date-only iba DESPUÉS del alta.
    expect(isAfterCursor(resena, legado)).toBe(true);
    expect(isAfterCursor(alta, legado)).toBe(false);
  });

  it("un cursor legado con hora de precisión no trunca la fecha al comparar (regresión #critical)", () => {
    // Cursor legado emitido por un evento con fecha de precisión horaria.
    const legado = parseCursor("2026-08-01T12:00:00.000+00:00~passes:aaa");
    const z: OrderableEntry = {
      orderDate: "2026-08-01",
      sortDate: "2026-08-01T00:00:00.000+00:00",
      id: "zzz_review",
    };
    // Semántica antigua: "2026-08-01" (entry) vs "2026-08-01T12:00:00.000+00:00"
    // (cursor) como cadenas completas -> "2026-08-01" < "...T12:00..." -> true.
    // Si `day` se trunca a 10 caracteres antes de comparar, ambas cadenas
    // quedan iguales y la fila se pierde silenciosamente.
    expect(isAfterCursor(z, legado)).toBe(true);
  });
});

describe("cursorSourceFilter", () => {
  // Cursor de OTRA fuente sobre `diary`: sin propiedad del id, el empate
  // exacto se resuelve por prefijo — `diary_entries:` < `episode_watches:`,
  // así que las filas empatadas van DEBAJO del cursor, están por servir y la
  // cota es inclusiva.
  it("una fuente de columna `date` emite el keyset compuesto exacto", () => {
    const cursor = parseCursor("2026-08-01~2026-08-02T18:00:00.000+00:00~episode_watches:b");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.diary, cursor)).toBe(
      'finished_on.lt."2026-08-01",' +
        'and(finished_on.eq."2026-08-01",updated_at.lte."2026-08-02T18:00:00.000+00:00")',
    );
  });

  it("una fuente timestamptz traduce el día del cursor a su intervalo de instantes", () => {
    const cursor = parseCursor("2026-08-01~2026-08-01T09:00:00.000+00:00~episode_watches:a");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.added, cursor)).toBe(
      'created_at.lt."2026-08-01T00:00:00.000+00:00",' +
        'and(created_at.gte."2026-08-01T00:00:00.000+00:00",' +
        'created_at.lte."2026-08-01T09:00:00.000+00:00")',
    );
  });

  it("con el cursor BACKDATEADO recorta la rama del día, no arrastra días ya servidos", () => {
    // Una reseña terminada el 15 de julio y registrada hoy: `day` sale de
    // finished_on y `sortDate` de updated_at, 18 días MÁS ANCHO. Sin el recorte
    // la rama del día traería las altas de hoy —ya servidas—, gastaría el
    // `limit` entero en ellas y apagaría la paginación.
    const cursor = parseCursor("2026-07-15~2026-08-02T18:30:00.000+00:00~diary_entries:b");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.added, cursor)).toBe(
      'created_at.lt."2026-07-15T00:00:00.000+00:00",' +
        'and(created_at.gte."2026-07-15T00:00:00.000+00:00",' +
        'created_at.lt."2026-07-16T00:00:00.000+00:00")',
    );
  });

  it("con `sortDate` en el día ANTERIOR al del cursor no queda nada de ese día", () => {
    // `day` sale de una fecha LOCAL y `sortDate` de un timestamp UTC: en Madrid
    // (UTC+2) todo lo registrado entre las 00:00 y las 02:00 queda con day = D y
    // stamp = (D-1)T22:00..23:59Z.
    const cursor = parseCursor("2026-08-03~2026-08-02T22:00:00.000+00:00~diary_entries:c");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.added, cursor)).toBe(
      'created_at.lt."2026-08-03T00:00:00.000+00:00"',
    );
  });

  it("cruza fin de mes y año sin salirse del calendario", () => {
    const finDeAnyo = parseCursor("2026-12-31~2027-01-05T10:00:00.000+00:00~x");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.clubs, finDeAnyo)).toContain(
      'created_at.lt."2027-01-01T00:00:00.000+00:00"',
    );
    const bisiesto = parseCursor("2028-02-28~2028-03-05T10:00:00.000+00:00~x");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.clubs, bisiesto)).toContain(
      'created_at.lt."2028-02-29T00:00:00.000+00:00"',
    );
  });

  // --- Critical 1: medianoche exacta, sin parte fraccionaria ------------------
  //
  // Postgres OMITE la fracción cuando es cero, así que un `created_at` de
  // medianoche vuelve como "…T00:00:00+00:00" y no como "…T00:00:00.000+00:00".
  // Comparar ESA cadena contra el literal sintetizado en JS toma la rama
  // equivocada: '+' (0x2B) < '.' (0x2E), de modo que el `sortDate` del cursor
  // parece caer POR DEBAJO del arranque de su propio día aun siendo el mismo
  // instante. La rama del día desaparece y toda fila con ese mismo instante se
  // pierde para siempre.
  //
  // No es hipotético: `historicalCreatedAt` (src/lib/import/commit-row.ts)
  // escribe `date.finishedOn`, un "YYYY-MM-DD" pelado, así que TODO pase
  // histórico importado por CSV cae en medianoche exacta — y los pases son la
  // fuente `added`.
  it("la trampa que hace falta que no se dispare: '+' ordena por debajo de '.'", () => {
    const rendered = "2019-04-12T00:00:00+00:00"; // lo que Postgres devuelve
    const sintetizado = "2019-04-12T00:00:00.000+00:00"; // lo que este módulo escribe
    expect(rendered < sintetizado).toBe(true); // como CADENAS, uno va antes
    expect(new Date(rendered).getTime()).toBe(new Date(sintetizado).getTime()); // …y son el MISMO instante
  });

  it("un `sortDate` a medianoche sin fracción no colapsa la rama del día (#critical-1)", () => {
    const cursor = parseCursor("2019-04-12~2019-04-12T00:00:00+00:00~diary_entries_added:m");
    const filter = cursorSourceFilter(FEED_SOURCE_COLUMNS.added, cursor);
    // Si el módulo compara cadenas de distinta procedencia, cree que el cursor
    // está en el día anterior y emite SOLO `created_at.lt."…T00:00:00.000…"`:
    // la rama del propio día del cursor desaparece y con ella toda fila que
    // comparta ese instante.
    expect(filter).toContain('created_at.gte."2019-04-12T00:00:00.000+00:00"');
  });

  // --- Critical 2: el tercer componente de la clave --------------------------
  //
  // Sin cláusula de `id`, un empate exacto de (día, hora) reproduce #346: la
  // página 2 vuelve a traer las MISMAS filas, `isAfterCursor` las descarta
  // todas y la paginación se apaga. Alcanzable con un import de CSV, donde
  // todos los pases de un mismo `finished_on` comparten `created_at`.
  it("desempata por `id` en la fuente que POSEE el cursor (#critical-2)", () => {
    const cursor = parseCursor("2026-08-01~2026-08-01T09:00:00.000+00:00~diary_entries_added:uuid-5");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.added, cursor)).toBe(
      'created_at.lt."2026-08-01T00:00:00.000+00:00",' +
        'and(created_at.gte."2026-08-01T00:00:00.000+00:00",' +
        'created_at.lt."2026-08-01T09:00:00.000+00:00"),' +
        'and(created_at.eq."2026-08-01T09:00:00.000+00:00",id.lt."uuid-5")',
    );
  });

  it("una fuente `date` que posee el cursor desempata por `id`", () => {
    const cursor = parseCursor("2026-08-01~2026-08-02T18:00:00.000+00:00~diary_entries:uuid-5");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.diary, cursor)).toBe(
      'finished_on.lt."2026-08-01",' +
        'and(finished_on.eq."2026-08-01",updated_at.lt."2026-08-02T18:00:00.000+00:00"),' +
        'and(finished_on.eq."2026-08-01",updated_at.eq."2026-08-02T18:00:00.000+00:00",id.lt."uuid-5")',
    );
  });

  // El empate CRUZADO sí se puede acotar, y sin cláusula de `id`: los ids de
  // evento llevan prefijo de fuente, así que ante un empate exacto de (día,
  // hora) el prefijo decide el desempate para TODAS las filas de esa fuente a
  // la vez. `club_activities:` < `diary_entries_added:` ⇒ todas aceptadas ⇒
  // cota inclusiva; al revés ⇒ todas descartadas ⇒ cota estricta.
  it("un cursor de OTRA fuente acota el empate por el prefijo del id", () => {
    const stamp = "2026-08-01T09:00:00.000+00:00";
    const desdeClub = parseCursor(`2026-08-01~${stamp}~club_activities:x`);
    // `diary_entries_added:…` > `club_activities:…` ⇒ el empate ya se sirvió.
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.added, desdeClub)).toContain(
      `created_at.lt."${stamp}"`,
    );
    const desdeAlta = parseCursor(`2026-08-01~${stamp}~diary_entries_added:x`);
    // `club_activities:…` < `diary_entries_added:…` ⇒ el empate está por servir.
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.clubs, desdeAlta)).toContain(
      `created_at.lte."${stamp}"`,
    );
  });

  it("un id de cursor sin prefijo conocido cae a la cota inclusiva (superconjunto)", () => {
    const cursor = parseCursor("2026-08-01~2026-08-01T09:00:00.000+00:00~raro");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.added, cursor)).toContain(
      'created_at.lte."2026-08-01T09:00:00.000+00:00"',
    );
  });

  it("un cursor legado (sin hora) cae a un filtro de solo día", () => {
    const legado = parseCursor("2026-08-01~passes:aaa");
    expect(legado.sortDate).toBeNull();
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.diary, legado)).toBe('finished_on.lte."2026-08-01"');
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.added, legado)).toBe(
      'created_at.lt."2026-08-02T00:00:00.000+00:00"',
    );
  });
});

// --- La propiedad: el filtro SQL y `isAfterCursor` son el mismo conjunto ------
//
// Es LA invariante del feed y la que ya ha producido seis defectos, todos
// silenciosos. Se escribe como producto cartesiano de las relaciones que
// importan —día del cursor × día de la hora del cursor × día de la fila × hora
// de la fila × las cinco fuentes— y no como una lista de cursores elegidos a
// mano: los seis defectos anteriores sobrevivieron precisamente a listas que
// omitían la forma que fallaba.
//
// El filtro se evalúa con `rowMatchesOrFilter`, EL MISMO evaluador con el que el
// doble de Supabase sirve filas, de modo que esta prueba y el recorrido de
// paginación no puedan discrepar sobre qué significa el filtro.

const DAYS = ["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"];
const HOURS = ["00:00:00.000", "09:00:00.000", "22:00:00.000", "23:59:59.999"];
const STAMPS = DAYS.flatMap((d) => HOURS.map((h) => `${d}T${h}+00:00`));
const IDS = ["a-000", "z-999"];
// Ids de EVENTO: el id que viaja en el cursor lleva prefijo de fuente, mientras
// la columna guarda el uuid pelado. La distinción no es cosmética — es la que
// decide si el filtro puede desempatar por id (fuente propietaria) o solo por
// prefijo (empate cruzado), así que la propiedad tiene que verla.
const EVENT_IDS = (Object.keys(FEED_SOURCE_COLUMNS) as FeedSourceKey[]).flatMap((key) =>
  IDS.map((id) => `${FEED_SOURCE_COLUMNS[key].eventIdPrefix}${id}`),
);

/**
 * ¿`entry` está POR ENCIMA del cursor —o ES el cursor—, o sea ya servido en una
 * página anterior? Complemento EXACTO de `isAfterCursor` para un cursor
 * moderno, con los TRES componentes de la clave. Antes ignoraba el `id` a
 * propósito, y esa exención era justo la que dejaba pasar el empate exacto de
 * (día, hora) que reproduce #346.
 */
function sortsAboveCursor(entry: OrderableEntry, cursor: FeedCursor): boolean {
  const day = dayOf(entry.orderDate);
  if (day !== cursor.day) return day > cursor.day;
  const stamp = cursor.sortDate ?? "";
  if (entry.sortDate !== stamp) return entry.sortDate > stamp;
  return entry.id >= cursor.id; // `>=`: el propio evento del cursor ya se sirvió
}

/** Filas de una fuente, con sus columnas reales, y la entrada que producen. */
function rowsFor(key: FeedSourceKey): { row: FakeRow; entry: OrderableEntry }[] {
  const { dateColumn, stampColumn, eventIdPrefix } = FEED_SOURCE_COLUMNS[key];
  const out: { row: FakeRow; entry: OrderableEntry }[] = [];
  for (const stamp of STAMPS) {
    for (const id of IDS) {
      const eventId = `${eventIdPrefix}${id}`;
      if (dateColumn === stampColumn) {
        // Altas y clubes: la columna de fecha y la de hora son la MISMA, así
        // que no pueden divergir.
        out.push({
          row: { id, [dateColumn]: stamp },
          entry: { orderDate: stamp, sortDate: stamp, id: eventId },
        });
        continue;
      }
      for (const day of DAYS) {
        out.push({
          row: { id, [dateColumn]: day, [stampColumn]: stamp },
          entry: { orderDate: day, sortDate: stamp, id: eventId },
        });
      }
    }
  }
  return out;
}

const MODERN_CURSORS = DAYS.flatMap((day) =>
  STAMPS.flatMap((stamp) => EVENT_IDS.map((id) => `${day}~${stamp}~${id}`)),
);
// Los dos formatos anteriores de cursor, que siguen vivos en una pestaña abierta
// durante el despliegue.
const LEGACY_CURSORS = [
  ...DAYS.flatMap((day) => IDS.map((id) => `${day}~${id}`)),
  ...STAMPS.flatMap((stamp) => IDS.map((id) => `${stamp}~${id}`)),
];

describe("el filtro de query y isAfterCursor son el mismo conjunto", () => {
  for (const key of Object.keys(FEED_SOURCE_COLUMNS) as FeedSourceKey[]) {
    const rows = rowsFor(key);

    it(`${key}: el filtro no deja fuera NINGUNA fila que isAfterCursor acepte`, () => {
      const perdidas: string[] = [];
      for (const raw of [...MODERN_CURSORS, ...LEGACY_CURSORS]) {
        const cursor = parseCursor(raw);
        const filter = cursorSourceFilter(FEED_SOURCE_COLUMNS[key], cursor);
        for (const { row, entry } of rows) {
          if (!isAfterCursor(entry, cursor)) continue;
          if (!rowMatchesOrFilter(row, filter)) {
            perdidas.push(
              `cursor ${raw} · fila ${JSON.stringify(row)} aceptada por isAfterCursor ` +
                `y rechazada por el filtro ${filter}`,
            );
          }
        }
      }
      expect(perdidas).toEqual([]);
    });

    it(`${key}: el filtro no trae NINGUNA fila que ya se sirvió`, () => {
      // La otra mitad: traer filas de más no pierde datos por sí solo, pero
      // gasta el `limit` de la página en filas que `isAfterCursor` descarta —
      // y cuando lo gasta entero, `fresh` queda vacío, `nextCursor` se apaga y
      // el feed se trunca. Es el mecanismo exacto de #346.
      //
      // La exigencia incluye el DESEMPATE POR ID. Antes no: el oráculo
      // ignoraba el `id`, y con eso el empate exacto de (día, hora) —K filas
      // con el MISMO instante, servidas de nuevo en cada página hasta que
      // `fresh` queda vacío— quedaba fuera de la propiedad por construcción.
      // Es #346 otra vez, con el empate movido de «mismo día» a «mismo
      // instante», y llega por la misma puerta: un import de CSV donde todos
      // los pases de un `finished_on` comparten `created_at`.
      //
      // Ojo con lo que este producto cartesiano NO cubre: todos los stamps
      // llevan fracción explícita (`.000`). La forma sin fracción —la que
      // Postgres devuelve a medianoche exacta— no puede vivir aquí, porque el
      // evaluador del doble compara CADENAS y daría falsos positivos justo
      // donde Postgres compara instantes. Esa forma se cubre arriba, contra el
      // filtro emitido.
      const desperdicio: string[] = [];
      for (const raw of MODERN_CURSORS) {
        const cursor = parseCursor(raw);
        const filter = cursorSourceFilter(FEED_SOURCE_COLUMNS[key], cursor);
        for (const { row, entry } of rows) {
          if (!rowMatchesOrFilter(row, filter)) continue;
          if (sortsAboveCursor(entry, cursor)) {
            desperdicio.push(
              `cursor ${raw} · fila ${JSON.stringify(row)} ya servida pero aceptada ` +
                `por el filtro ${filter}`,
            );
          }
        }
      }
      expect(desperdicio).toEqual([]);
    });
  }
});

describe("recorrido completo de paginación", () => {
  it("sirve cada fila exactamente una vez con fechas de granularidad mezclada", () => {
    const all: OrderableEntry[] = [
      alta,
      resena,
      { orderDate: "2026-08-01", sortDate: "2026-08-01T12:00:00.000+00:00", id: "episode_watches:d" },
      { orderDate: "2026-07-31", sortDate: "2026-07-31T09:00:00.000+00:00", id: "passes:e" },
      { orderDate: "2026-07-31", sortDate: "2026-07-31T09:00:00.000+00:00", id: "passes:f" },
      { orderDate: "2026-07-30T22:00:00.000+00:00", sortDate: "2026-07-30T22:00:00.000+00:00", id: "passes:g" },
    ];
    const sorted = [...all].sort(compareEntries);

    const served: string[] = [];
    let cursor: string | null = null;
    const PAGE = 2;
    for (let guard = 0; guard < 10; guard++) {
      const parsed: FeedCursor | null = cursor ? parseCursor(cursor) : null;
      const fresh: OrderableEntry[] = parsed
        ? sorted.filter((e) => isAfterCursor(e, parsed))
        : sorted;
      const page: OrderableEntry[] = fresh.slice(0, PAGE);
      if (page.length === 0) break;
      served.push(...page.map((e) => e.id));
      cursor = page.length < PAGE ? null : makeCursor(page[page.length - 1]);
      if (cursor === null) break;
    }

    expect(served).toEqual(sorted.map((e) => e.id));
    expect(new Set(served).size).toBe(all.length);
  });
});
