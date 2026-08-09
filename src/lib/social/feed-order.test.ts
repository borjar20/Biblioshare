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

// El feed lee dos fuentes timestamptz sobre `created_at` —posts y clubes— y
// ordena por fecha de PUBLICACIÓN. La clave de orden es (día, instante, id) y su
// mitad SQL (`cursorSourceFilter`) tiene que aceptar EXACTAMENTE lo que acepta
// `isAfterCursor`, o la paginación pierde o repite filas.

const nuevo: OrderableEntry = {
  orderDate: "2026-08-01T15:00:00.000+00:00",
  sortDate: "2026-08-01T15:00:00.000+00:00",
  id: "posts:aaa",
};
const viejo: OrderableEntry = {
  orderDate: "2026-08-01T09:00:00.000+00:00",
  sortDate: "2026-08-01T09:00:00.000+00:00",
  id: "posts:bbb",
};

describe("compareEntries", () => {
  it("ordena por instante descendente", () => {
    expect([viejo, nuevo].sort(compareEntries)).toEqual([nuevo, viejo]);
  });

  it("ordena por día antes que por hora", () => {
    const ayer: OrderableEntry = {
      orderDate: "2026-07-31T23:59:00.000+00:00",
      sortDate: "2026-07-31T23:59:00.000+00:00",
      id: "posts:ccc",
    };
    expect([ayer, viejo].sort(compareEntries)).toEqual([viejo, ayer]);
  });

  it("desempata por id cuando día y hora coinciden", () => {
    const a = { ...nuevo, id: "posts:aaa" };
    const b = { ...nuevo, id: "posts:zzz" };
    expect([a, b].sort(compareEntries)).toEqual([b, a]);
  });
});

// El desempate por `sortDate` y el día por `dayOf` se comparaban como STRINGS,
// lo que solo equivale al orden temporal real si TODOS los timestamps llevan el
// mismo offset `+00:00`. El lado SQL ya compara por INSTANTE, así que si el JS
// compara por string y algún valor llega con otro offset, JS y SQL discrepan →
// se pierden o repiten filas. (#347)
describe("orden por instante, no por string de offset no verificado (#347)", () => {
  it("compareEntries desempata por INSTANTE aunque el offset difiera", () => {
    const A: OrderableEntry = {
      orderDate: "2026-08-02T20:00:00.000+02:00", // 18:00Z
      sortDate: "2026-08-02T20:00:00.000+02:00",
      id: "posts:a",
    };
    const B: OrderableEntry = {
      orderDate: "2026-08-02T19:00:00.000+00:00", // 19:00Z
      sortDate: "2026-08-02T19:00:00.000+00:00",
      id: "posts:b",
    };
    expect([A, B].sort(compareEntries)).toEqual([B, A]);
  });

  it("isAfterCursor decide por INSTANTE aunque el offset difiera", () => {
    const cursorB = parseCursor("2026-08-02~2026-08-02T19:00:00.000+00:00~posts:b");
    const A: OrderableEntry = {
      orderDate: "2026-08-02T20:00:00.000+02:00",
      sortDate: "2026-08-02T20:00:00.000+02:00",
      id: "posts:a",
    };
    expect(isAfterCursor(A, cursorB)).toBe(true);
  });

  it("dayOf toma el día UTC de un timestamp, no el día del offset local", () => {
    expect(dayOf("2026-08-03T01:00:00.000+02:00")).toBe("2026-08-02");
    expect(dayOf("2026-08-02")).toBe("2026-08-02");
    expect(dayOf("2026-08-02T14:00:00.000+00:00")).toBe("2026-08-02");
  });
});

describe("cursor", () => {
  it("un cursor nuevo lleva día, hora e id", () => {
    expect(makeCursor(nuevo)).toBe("2026-08-01~2026-08-01T15:00:00.000+00:00~posts:aaa");
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
    expect(parseCursor("2026-08-01~posts:bbb")).toEqual({
      day: "2026-08-01",
      sortDate: null,
      id: "posts:bbb",
      legacyFullDate: "2026-08-01",
    });
  });
});

describe("isAfterCursor", () => {
  it("excluye el propio evento del cursor", () => {
    expect(isAfterCursor(nuevo, parseCursor(makeCursor(nuevo)))).toBe(false);
  });

  it("incluye lo que va estrictamente después en el orden total", () => {
    expect(isAfterCursor(viejo, parseCursor(makeCursor(nuevo)))).toBe(true);
  });

  it("excluye lo que va antes", () => {
    expect(isAfterCursor(nuevo, parseCursor(makeCursor(viejo)))).toBe(false);
  });

  it("un cursor legado con hora de precisión no trunca la fecha al comparar (regresión #critical)", () => {
    const legado = parseCursor("2026-08-01T12:00:00.000+00:00~posts:aaa");
    const z: OrderableEntry = {
      orderDate: "2026-08-01",
      sortDate: "2026-08-01T00:00:00.000+00:00",
      id: "zzz_review",
    };
    expect(isAfterCursor(z, legado)).toBe(true);
  });
});

describe("cursorSourceFilter", () => {
  it("traduce el día del cursor a su intervalo de instantes", () => {
    // Cursor de posts sobre la fuente clubes: `club_activities:` < `posts:`, así
    // que el empate exacto va por servir y la cota del instante es inclusiva.
    const cursor = parseCursor("2026-08-01~2026-08-01T09:00:00.000+00:00~posts:a");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.clubs, cursor)).toBe(
      'created_at.lt."2026-08-01T00:00:00.000+00:00",' +
        'and(created_at.gte."2026-08-01T00:00:00.000+00:00",' +
        'created_at.lte."2026-08-01T09:00:00.000+00:00")',
    );
  });

  it("cruza fin de mes y año sin salirse del calendario", () => {
    // Cursor legado (solo día): la cota es `created_at.lt.nextDayStart`, que es
    // donde `addDaysUTC` tiene que respetar el calendario.
    const finDeAnyo = parseCursor("2026-12-31~posts:x");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.posts, finDeAnyo)).toBe(
      'created_at.lt."2027-01-01T00:00:00.000+00:00"',
    );
    const bisiesto = parseCursor("2028-02-28~posts:x");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.posts, bisiesto)).toBe(
      'created_at.lt."2028-02-29T00:00:00.000+00:00"',
    );
  });

  // --- Critical 1: medianoche exacta, sin parte fraccionaria ------------------
  //
  // Postgres OMITE la fracción cuando es cero, así que un `created_at` de
  // medianoche vuelve como "…T00:00:00+00:00" y no como "…T00:00:00.000+00:00".
  // Comparar ESA cadena contra el literal sintetizado en JS toma la rama
  // equivocada ('+' 0x2B < '.' 0x2E) y la rama del propio día del cursor
  // desaparece, perdiendo toda fila con ese instante. No es hipotético: los
  // pases importados por CSV llevan created_at a medianoche exacta.
  it("la trampa que hace falta que no se dispare: '+' ordena por debajo de '.'", () => {
    const rendered = "2019-04-12T00:00:00+00:00";
    const sintetizado = "2019-04-12T00:00:00.000+00:00";
    expect(rendered < sintetizado).toBe(true);
    expect(new Date(rendered).getTime()).toBe(new Date(sintetizado).getTime());
  });

  it("un `sortDate` a medianoche sin fracción no colapsa la rama del día (#critical-1)", () => {
    const cursor = parseCursor("2019-04-12~2019-04-12T00:00:00+00:00~posts:m");
    const filter = cursorSourceFilter(FEED_SOURCE_COLUMNS.posts, cursor);
    expect(filter).toContain('created_at.gte."2019-04-12T00:00:00.000+00:00"');
  });

  // --- Critical 2: el tercer componente de la clave --------------------------
  //
  // Sin cláusula de `id`, un empate exacto de (día, hora) reproduce #346: la
  // página 2 vuelve a traer las MISMAS filas y la paginación se apaga.
  it("desempata por `id` en la fuente que POSEE el cursor (#critical-2)", () => {
    const cursor = parseCursor("2026-08-01~2026-08-01T09:00:00.000+00:00~posts:uuid-5");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.posts, cursor)).toBe(
      'created_at.lt."2026-08-01T00:00:00.000+00:00",' +
        'and(created_at.gte."2026-08-01T00:00:00.000+00:00",' +
        'created_at.lt."2026-08-01T09:00:00.000+00:00"),' +
        'and(created_at.eq."2026-08-01T09:00:00.000+00:00",id.lt."uuid-5")',
    );
  });

  // El empate CRUZADO se acota sin cláusula de `id`: los ids de evento llevan
  // prefijo de fuente, así que ante un empate exacto el prefijo decide el
  // desempate para TODAS las filas de esa fuente a la vez.
  // `club_activities:` < `posts:` ⇒ desde un cursor de post, los clubes
  // empatados van por servir (inclusiva); al revés, ya se sirvieron (estricta).
  it("un cursor de OTRA fuente acota el empate por el prefijo del id", () => {
    const stamp = "2026-08-01T09:00:00.000+00:00";
    const desdePost = parseCursor(`2026-08-01~${stamp}~posts:x`);
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.clubs, desdePost)).toContain(`created_at.lte."${stamp}"`);
    const desdeClub = parseCursor(`2026-08-01~${stamp}~club_activities:x`);
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.posts, desdeClub)).toContain(`created_at.lt."${stamp}"`);
  });

  it("un id de cursor sin prefijo conocido cae a la cota inclusiva (superconjunto)", () => {
    const cursor = parseCursor("2026-08-01~2026-08-01T09:00:00.000+00:00~raro");
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.posts, cursor)).toContain(
      'created_at.lte."2026-08-01T09:00:00.000+00:00"',
    );
  });

  it("un cursor legado (sin hora) cae a un filtro de solo día", () => {
    const legado = parseCursor("2026-08-01~posts:aaa");
    expect(legado.sortDate).toBeNull();
    expect(cursorSourceFilter(FEED_SOURCE_COLUMNS.posts, legado)).toBe(
      'created_at.lt."2026-08-02T00:00:00.000+00:00"',
    );
  });
});

// --- La propiedad: el filtro SQL y `isAfterCursor` son el mismo conjunto ------
//
// LA invariante del feed, la que ya produjo seis defectos silenciosos. Se
// escribe como producto cartesiano de las relaciones que importan, no como una
// lista de cursores a mano. Se evalúa con `rowMatchesOrFilter`, EL MISMO
// evaluador con que el doble de Supabase sirve filas.

const DAYS = ["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"];
const HOURS = ["00:00:00.000", "09:00:00.000", "22:00:00.000", "23:59:59.999"];
const STAMPS = DAYS.flatMap((d) => HOURS.map((h) => `${d}T${h}+00:00`));
const IDS = ["a-000", "z-999"];
const EVENT_IDS = (Object.keys(FEED_SOURCE_COLUMNS) as FeedSourceKey[]).flatMap((key) =>
  IDS.map((id) => `${FEED_SOURCE_COLUMNS[key].eventIdPrefix}${id}`),
);

function sortsAboveCursor(entry: OrderableEntry, cursor: FeedCursor): boolean {
  const day = dayOf(entry.orderDate);
  if (day !== cursor.day) return day > cursor.day;
  const stamp = cursor.sortDate ?? "";
  if (entry.sortDate !== stamp) return entry.sortDate > stamp;
  return entry.id >= cursor.id;
}

// Ambas fuentes vivas son timestamptz sobre `created_at`: la columna de fecha y
// la de hora coinciden, así que cada fila es un único instante.
function rowsFor(key: FeedSourceKey): { row: FakeRow; entry: OrderableEntry }[] {
  const { dateColumn, eventIdPrefix } = FEED_SOURCE_COLUMNS[key];
  const out: { row: FakeRow; entry: OrderableEntry }[] = [];
  for (const stamp of STAMPS) {
    for (const id of IDS) {
      const eventId = `${eventIdPrefix}${id}`;
      out.push({ row: { id, [dateColumn]: stamp }, entry: { orderDate: stamp, sortDate: stamp, id: eventId } });
    }
  }
  return out;
}

const MODERN_CURSORS = DAYS.flatMap((day) =>
  STAMPS.flatMap((stamp) => EVENT_IDS.map((id) => `${day}~${stamp}~${id}`)),
);
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
            perdidas.push(`cursor ${raw} · fila ${JSON.stringify(row)} rechazada por ${filter}`);
          }
        }
      }
      expect(perdidas).toEqual([]);
    });

    it(`${key}: el filtro no trae NINGUNA fila que ya se sirvió`, () => {
      const desperdicio: string[] = [];
      for (const raw of MODERN_CURSORS) {
        const cursor = parseCursor(raw);
        const filter = cursorSourceFilter(FEED_SOURCE_COLUMNS[key], cursor);
        for (const { row, entry } of rows) {
          if (!rowMatchesOrFilter(row, filter)) continue;
          if (sortsAboveCursor(entry, cursor)) {
            desperdicio.push(`cursor ${raw} · fila ${JSON.stringify(row)} ya servida pero aceptada por ${filter}`);
          }
        }
      }
      expect(desperdicio).toEqual([]);
    });
  }
});

describe("recorrido completo de paginación", () => {
  it("sirve cada fila exactamente una vez", () => {
    const all: OrderableEntry[] = [
      nuevo,
      viejo,
      { orderDate: "2026-08-01T12:00:00.000+00:00", sortDate: "2026-08-01T12:00:00.000+00:00", id: "club_activities:d" },
      { orderDate: "2026-07-31T09:00:00.000+00:00", sortDate: "2026-07-31T09:00:00.000+00:00", id: "posts:e" },
      { orderDate: "2026-07-31T09:00:00.000+00:00", sortDate: "2026-07-31T09:00:00.000+00:00", id: "posts:f" },
      { orderDate: "2026-07-30T22:00:00.000+00:00", sortDate: "2026-07-30T22:00:00.000+00:00", id: "club_activities:g" },
    ];
    const sorted = [...all].sort(compareEntries);

    const served: string[] = [];
    let cursor: string | null = null;
    const PAGE = 2;
    for (let guard = 0; guard < 10; guard++) {
      const parsed: FeedCursor | null = cursor ? parseCursor(cursor) : null;
      const fresh: OrderableEntry[] = parsed ? sorted.filter((e) => isAfterCursor(e, parsed)) : sorted;
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
