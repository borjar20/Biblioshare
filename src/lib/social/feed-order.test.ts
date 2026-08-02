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
  it("una fuente de columna `date` emite el keyset compuesto exacto", () => {
    const cursor = parseCursor("2026-08-01~2026-08-02T18:00:00.000+00:00~diary_entries:b");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.diary, cursor)).toBe(
      'finished_on.lt."2026-08-01",' +
        'and(finished_on.eq."2026-08-01",updated_at.lte."2026-08-02T18:00:00.000+00:00")',
    );
  });

  it("una fuente timestamptz traduce el día del cursor a su intervalo de instantes", () => {
    const cursor = parseCursor("2026-08-01~2026-08-01T09:00:00.000+00:00~passes:a");
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

/** ¿`entry` está POR ENCIMA del cursor, o sea ya servido en una página anterior? */
function sortsAboveCursor(entry: OrderableEntry, cursor: FeedCursor): boolean {
  const day = dayOf(entry.orderDate);
  if (day !== cursor.day) return day > cursor.day;
  return entry.sortDate > (cursor.sortDate ?? "");
}

/** Filas de una fuente, con sus columnas reales, y la entrada que producen. */
function rowsFor(key: FeedSourceKey): { row: FakeRow; entry: OrderableEntry }[] {
  const { dateColumn, stampColumn } = FEED_SOURCE_COLUMNS[key];
  const out: { row: FakeRow; entry: OrderableEntry }[] = [];
  for (const stamp of STAMPS) {
    for (const id of IDS) {
      if (dateColumn === stampColumn) {
        // Altas y clubes: la columna de fecha y la de hora son la MISMA, así
        // que no pueden divergir.
        out.push({
          row: { id, [dateColumn]: stamp },
          entry: { orderDate: stamp, sortDate: stamp, id },
        });
        continue;
      }
      for (const day of DAYS) {
        out.push({
          row: { id, [dateColumn]: day, [stampColumn]: stamp },
          entry: { orderDate: day, sortDate: stamp, id },
        });
      }
    }
  }
  return out;
}

const MODERN_CURSORS = DAYS.flatMap((day) =>
  STAMPS.flatMap((stamp) => IDS.map((id) => `${day}~${stamp}~${id}`)),
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
      // El filtro no lleva componente de `id` a propósito (la comparación fina
      // la hace `isAfterCursor` en cliente), así que la exigencia es sobre día
      // y hora, no sobre el desempate.
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
