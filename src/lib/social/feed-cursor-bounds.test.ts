import { describe, it, expect } from "vitest";
import { getFeed } from "./feed";
import { addedUpperBound, isAfterCursor, parseCursor } from "./feed-order";
import { sessionRelativeBasis } from "@/lib/sessions/session-relative-basis";
import { fakeSupabase, type FakeFeedData, type FakeRow } from "./fake-feed-supabase";
import { todayISO } from "@/lib/stats/dates";

// Las cotas `.lte()` de `getFeed` y el filtro `isAfterCursor` de feed-order son
// UNA sola invariante: la cota tiene que ser un superconjunto de lo que el
// filtro acepta. feed-order.test.ts prueba el módulo puro y por construcción no
// puede cubrir la ELECCIÓN de cota que hace feed.ts; por eso este fichero
// pagina de verdad contra el doble y comprueba que ninguna fila se pierde.

const TODAY = todayISO();

function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Todo relativo a hoy: `sessionRelativeBasis` compara con el día real de
// ejecución, así que unas fechas fijas cambiarían de significado según el día
// en que se corra el test.
const REVIEW_DAY = daysBefore(TODAY, 18); // reseñas backdateadas, registradas HOY
const OLD_DAY = daysBefore(TODAY, 31); // altas viejas: las que se perdían

function stamp(day: string, hhmm: string): string {
  return `${day}T${hhmm}:00.000+00:00`;
}

// 6 altas de hoy, 5 reseñas backdateadas (registradas hoy, más tarde que las
// altas) y 4 altas viejas. Con pageSize 5 el cursor de la página 2 cae en una
// reseña backdateada: `day` = REVIEW_DAY pero `sortDate` = hoy. Ese es el
// momento en que una cota basada solo en `sortDate` vuelve a traer las altas de
// hoy —ya servidas—, gasta el `limit` en ellas y deja las 4 altas viejas sin
// servir en ninguna página.
const addedToday = Array.from({ length: 6 }, (_, i) => ({
  id: `alta-hoy-${i}`,
  created_at: stamp(TODAY, `09:0${i}`),
}));
const reviews = Array.from({ length: 5 }, (_, i) => ({
  id: `resena-${i}`,
  finished_on: REVIEW_DAY,
  created_at: stamp(TODAY, `18:0${i}`),
}));
const addedOld = Array.from({ length: 4 }, (_, i) => ({
  id: `alta-vieja-${i}`,
  created_at: stamp(OLD_DAY, `10:0${i}`),
}));

const EXPECTED_IDS = [
  ...addedToday.map((r) => `diary_entries_added:${r.id}`),
  ...reviews.map((r) => `diary_entries:${r.id}`),
  ...addedOld.map((r) => `diary_entries_added:${r.id}`),
].sort();

const DATA: FakeFeedData = { added: [...addedToday, ...addedOld], finished: reviews };

// --- Fuentes de fecha-only con el día del orden DISTINTO de la columna filtrada
//
// `eventDate` de estas tres fuentes es `sessionRelativeBasis(columna,
// created_at)`: para una fila de HOY devuelve `created_at`. Pero `todayISO()`
// es la fecha LOCAL y `created_at` es UTC, así que el día de orden pasa a ser
// un día UTC mientras la query sigue filtrando la columna `date` LOCAL. En
// UTC+2, lo registrado entre las 00:00 y las 02:00 locales queda con
// columna = D (hoy local) y created_at = (D-1)T22:00..23:59Z: el orden lo manda
// a AYER y la cota `lte(columna, ayer)` lo deja fuera para siempre.
const YESTERDAY = daysBefore(TODAY, 1);

// Una fila backdateada a ayer pero registrada hoy a las 18:00 se sienta justo
// encima (mismo día de orden, `sortDate` mayor): es el cursor ordinario que
// deja a la de abajo inalcanzable.
const divergentRows = (prefix: string, column: string, minute: number): FakeRow[] => [
  {
    id: `${prefix}-ayer`,
    [column]: YESTERDAY,
    created_at: stamp(TODAY, `18:0${minute}`),
  },
  {
    id: `${prefix}-hoy`,
    [column]: TODAY, // fecha LOCAL de hoy
    created_at: stamp(YESTERDAY, `22:3${minute}`), // día UTC anterior
  },
];

// La fuente de reseñas NO usa `created_at` como hora de registro sino
// `updated_at` (el pase se crea al añadir la obra y se termina después con un
// UPDATE — ver feed.ts). Sus filas divergentes se escriben aparte, con un
// `created_at` deliberadamente LEJANO y distinto del `updated_at`: si el
// fixture dejase que el doble copiara created_at → updated_at, la comprobación
// de superconjunto de más abajo coincidiría con producción por accidente y
// dejaría de vigilar qué columna usa `feed.ts`.
const divergentReviews: FakeRow[] = [
  {
    id: "resena-ayer",
    finished_on: YESTERDAY,
    created_at: stamp(daysBefore(TODAY, 9), "08:00"), // alta del pase
    updated_at: stamp(TODAY, "18:00"), // registro del terminado
  },
  {
    id: "resena-hoy",
    finished_on: TODAY, // fecha LOCAL de hoy
    created_at: stamp(daysBefore(TODAY, 9), "08:05"),
    updated_at: stamp(YESTERDAY, "22:30"), // día UTC anterior
  },
];

// Las tres fuentes con columna `date`, la columna filtrada y la columna de la
// que sale su `sortDate`/hora de registro real en `feed.ts`.
const DATE_ONLY_SOURCES = [
  { key: "diary", column: "finished_on", stampColumn: "updated_at", idPrefix: "diary_entries", dataKey: "finished" },
  { key: "progress_sessions", column: "session_date", stampColumn: "created_at", idPrefix: "progress_sessions", dataKey: "sessions" },
  { key: "episode_watches", column: "watched_on", stampColumn: "created_at", idPrefix: "episode_watches", dataKey: "episodes" },
] as const;

const DIVERGENT_DATA: FakeFeedData = {
  finished: divergentReviews,
  sessions: divergentRows("sesion", "session_date", 1),
  episodes: divergentRows("episodio", "watched_on", 2),
};

const DIVERGENT_EXPECTED_IDS = DATE_ONLY_SOURCES.flatMap((s) =>
  (DIVERGENT_DATA[s.dataKey] ?? []).map((r) => `${s.idPrefix}:${r.id}`),
).sort();

// --- Reseña terminada HOY sobre un pase creado hace semanas
//
// El pase se crea al añadir la obra a la biblioteca; el "terminado" llega
// después como UPDATE. Si el día de orden sale de `created_at`, esa reseña
// ordena en el día del ALTA (hace semanas) mientras su `finished_on` es hoy:
// `isAfterCursor` la acepta con un cursor de aquel día, pero la cota
// `lte("finished_on", día+1)` de esa página la deja fuera. No se sirve en
// NINGUNA página, y ensanchar la cota no lo arregla: el hueco es el tiempo de
// lectura entero, no un desfase de husos.
const PASS_CREATED_DAY = daysBefore(TODAY, 20);
const MID_DAY = daysBefore(TODAY, 5);

const lateReview = {
  id: "resena-tardia",
  finished_on: TODAY,
  created_at: stamp(PASS_CREATED_DAY, "10:00"), // alta del pase
  updated_at: stamp(TODAY, "18:00"), // registro del terminado
};
// Dos altas de hoy y dos episodios de hace 5 días: bastan para que el cursor
// baje de HOY a MID_DAY con la página llena, que es el salto tras el cual la
// cota de `diary` ya no puede alcanzar un `finished_on` de hoy.
const LATE_DATA: FakeFeedData = {
  added: Array.from({ length: 2 }, (_, i) => ({
    id: `alta-${i}`,
    created_at: stamp(TODAY, `09:0${i}`),
  })),
  episodes: Array.from({ length: 2 }, (_, i) => ({
    id: `episodio-${i}`,
    watched_on: MID_DAY,
    created_at: stamp(MID_DAY, `10:0${i}`),
  })),
  finished: [lateReview],
};
const LATE_EXPECTED_IDS = [
  "diary_entries_added:alta-0",
  "diary_entries_added:alta-1",
  "episode_watches:episodio-0",
  "episode_watches:episodio-1",
  "diary_entries:resena-tardia",
].sort();

// --- Sesión con fecha FUTURA registrada días antes
//
// El formulario de registro no acota `session_date` por arriba (no hay `max` en
// el input ni CHECK en la tabla): se puede registrar hoy una sesión fechada
// dentro de cinco días. Cuando ese día llega, `session_date === todayISO()` y
// `sessionRelativeBasis` sustituía por un `created_at` de hace cinco días: el
// día de orden caía CINCO días por debajo de la columna y la cota
// `lte(session_date, día+1)` no podía alcanzarla en ninguna página. Es la misma
// forma que ya rompió `passes.created_at`, pero con el desfase por el otro lado.
const FUTURE_SESSION_LOGGED_DAY = daysBefore(TODAY, 5);

const FUTURE_SESSION_DATA: FakeFeedData = {
  added: Array.from({ length: 2 }, (_, i) => ({
    id: `alta-${i}`,
    created_at: stamp(TODAY, `09:0${i}`),
  })),
  // Dos episodios en el día del registro: bastan para que el cursor baje de HOY
  // a ese día con la página llena, que es el salto tras el cual la cota de
  // `progress_sessions` ya no puede alcanzar un `session_date` de hoy.
  episodes: Array.from({ length: 2 }, (_, i) => ({
    id: `episodio-${i}`,
    watched_on: FUTURE_SESSION_LOGGED_DAY,
    created_at: stamp(FUTURE_SESSION_LOGGED_DAY, `10:0${i}`),
  })),
  sessions: [
    {
      id: "sesion-futura",
      session_date: TODAY, // hoy… pero se registró cinco días antes
      created_at: stamp(FUTURE_SESSION_LOGGED_DAY, "08:00"),
    },
  ],
};
const FUTURE_SESSION_EXPECTED_IDS = [
  "diary_entries_added:alta-0",
  "diary_entries_added:alta-1",
  "episode_watches:episodio-0",
  "episode_watches:episodio-1",
  "progress_sessions:sesion-futura",
].sort();

// --- Clubes: `eventDate === sortDate === created_at`, igual que `added`.
const CLUB_DAY = daysBefore(TODAY, 5);
const clubActivities = Array.from({ length: 6 }, (_, i) => ({
  id: `actividad-${i}`,
  created_at: stamp(CLUB_DAY, `10:0${i}`),
}));
const CLUB_DATA: FakeFeedData = { clubActivities };
const CLUB_EXPECTED_IDS = clubActivities.map((r) => `club_activities:${r.id}`).sort();

type Walk = {
  served: string[];
  /** Cota que feed.ts pasó a la fuente `added` en cada página con cursor. */
  addedBounds: string[];
  /** La que exige el orden total, recalculada desde el cursor servido. */
  expectedBounds: string[];
  /** Cota por fuente y el cursor vigente en esa página, para la propiedad. */
  pages: { cursor: string; bounds: Record<string, string | undefined> }[];
};

async function walk(pageSize: number, data: FakeFeedData = DATA): Promise<Walk> {
  const served: string[] = [];
  const addedBounds: string[] = [];
  const expectedBounds: string[] = [];
  const pages: Walk["pages"] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 20; guard++) {
    // Un doble por página: así `lteCalls` recoge las cotas de ESA página.
    const fake = fakeSupabase(data);
    const page = await getFeed(fake.client, "viewer-1", { cursor, pageSize });
    if (cursor) {
      addedBounds.push(fake.lteCalls.added?.[0]?.value ?? "(sin cota)");
      expectedBounds.push(addedUpperBound(parseCursor(cursor)));
      const bounds: Record<string, string | undefined> = {};
      for (const [source, calls] of Object.entries(fake.lteCalls)) bounds[source] = calls[0]?.value;
      pages.push({ cursor, bounds });
    }
    for (const entry of page.events) {
      if (entry.source === "person-group") served.push(...entry.items.map((e) => e.id));
      else served.push(entry.id);
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return { served, addedBounds, expectedBounds, pages };
}

// Cada recorrido solo ejercita su defecto si el cursor cae donde el fixture
// supone. Nada de eso está garantizado por construcción: cambiar `pageSize` o
// añadir filas mueve el corte de página y el test se quedaría verde sin probar
// nada. Por eso cada walk afirma además el `day` del cursor que le importa.
function cursorDay(pages: Walk["pages"], index: number): string {
  expect(pages.length).toBeGreaterThan(index);
  return parseCursor(pages[index].cursor).day;
}

describe("cotas de cursor de getFeed", () => {
  it("sirve cada fila exactamente una vez paginando hasta agotar el feed", async () => {
    const { served, pages } = await walk(5);
    expect(new Set(served).size).toBe(served.length); // ninguna repetida
    expect([...served].sort()).toEqual(EXPECTED_IDS); // ninguna perdida
    // El cursor que destapa el defecto es el BACKDATEADO: `day` = REVIEW_DAY
    // mientras `sortDate` es de hoy. Si el corte de página deja de caer en una
    // reseña, este recorrido ya no prueba lo que dice probar.
    expect(cursorDay(pages, 1)).toBe(REVIEW_DAY);
    expect(parseCursor(pages[1].cursor).sortDate?.slice(0, 10)).toBe(TODAY);
  });

  // OJO con lo que este test NO prueba: `expectedBounds` se calcula llamando a
  // `addedUpperBound`, o sea la propia función bajo prueba, así que NO es un
  // oráculo de corrección — si `addedUpperBound` devolviera una cota mal
  // calculada, este test seguiría en verde. Lo único que comprueba es el
  // CABLEADO: que `feed.ts` derive su `.lte("created_at", …)` del helper y no
  // de una fórmula propia duplicada (que es justo el RED que lo motivó). La
  // corrección del valor la prueba `feed-order.test.ts` contra `isAfterCursor`,
  // y la ausencia de pérdidas el test de paginación de arriba.
  it("la cota de `added` coincide con el supremo de lo que acepta isAfterCursor", async () => {
    const { addedBounds, expectedBounds } = await walk(5);
    expect(addedBounds.length).toBeGreaterThan(0);
    expect(addedBounds).toEqual(expectedBounds);
  });
});

describe("cotas de las fuentes de fecha-only cuando el día de orden no es la columna", () => {
  it("sirve cada fila exactamente una vez aunque el día de orden sea UTC y la columna local", async () => {
    const { served, pages } = await walk(2, DIVERGENT_DATA);
    expect(new Set(served).size).toBe(served.length);
    expect([...served].sort()).toEqual(DIVERGENT_EXPECTED_IDS);
    // Lo que hace peligroso este fixture es que el cursor esté en AYER
    // mientras las filas `-hoy` tienen la columna en HOY: es ahí donde la cota
    // ensanchada un día es la única que las alcanza.
    expect(cursorDay(pages, 0)).toBe(YESTERDAY);
  });

  // La propiedad, escrita sobre las fuentes donde `dayOf(eventDate)` PUEDE
  // separarse de la columna filtrada (el test equivalente de `added` no puede
  // fallar: allí eventDate, sortDate y la columna son la misma).
  it("ninguna cota excluye una fila que isAfterCursor acepta", async () => {
    const { pages } = await walk(2, DIVERGENT_DATA);
    expect(pages.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const { cursor, bounds } of pages) {
      const parsed = parseCursor(cursor);
      for (const source of DATE_ONLY_SOURCES) {
        const bound = bounds[source.key];
        if (bound === undefined) continue;
        for (const row of DIVERGENT_DATA[source.dataKey] ?? []) {
          const column = String(row[source.column]);
          // La hora de registro sale de la columna que use ESA fuente en
          // `feed.ts` (updated_at en reseñas, created_at en las otras dos), no
          // de created_at para todas.
          const registeredAt = String(row[source.stampColumn]);
          const entry = {
            eventDate: sessionRelativeBasis(column, registeredAt),
            sortDate: registeredAt,
            id: `${source.idPrefix}:${row.id}`,
          };
          if (!isAfterCursor(entry, parsed)) continue;
          if (column > bound) {
            violations.push(
              `${entry.id}: ${source.column}=${column} > cota ${bound} (cursor ${cursor}, eventDate ${entry.eventDate})`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("reseña terminada hoy sobre un pase creado hace semanas", () => {
  it("se sirve en alguna página del recorrido completo", async () => {
    const { served, pages } = await walk(2, LATE_DATA);
    expect(new Set(served).size).toBe(served.length);
    expect([...served].sort()).toEqual(LATE_EXPECTED_IDS);
    // El salto peligroso es el que baja el cursor a MID_DAY: desde ahí la cota
    // `lte(finished_on, MID_DAY+1)` ya no alcanza un finished_on de HOY.
    expect(cursorDay(pages, 1)).toBe(MID_DAY);
  });
});

describe("sesión fechada en el futuro y registrada días antes", () => {
  it("se sirve en alguna página del recorrido completo", async () => {
    const { served, pages } = await walk(2, FUTURE_SESSION_DATA);
    expect(new Set(served).size).toBe(served.length);
    expect([...served].sort()).toEqual(FUTURE_SESSION_EXPECTED_IDS);
    // Igual que arriba: sin este cursor el recorrido no ejercita nada.
    expect(cursorDay(pages, 1)).toBe(FUTURE_SESSION_LOGGED_DAY);
  });
});

// --- #346: un día con MÁS de `pageSize` filas en una sola fuente
//
// La reproducción que la issue no trae. Con una cota que solo depende del DÍA
// del cursor (`lte(columna, día + 1)`), todas las páginas que caen dentro del
// mismo día emiten la MISMA cota; la query ordena por la columna desc y corta a
// `pageSize`, así que devuelve las MISMAS filas de cabeza una y otra vez.
// `isAfterCursor` las descarta todas por ya servidas, `fresh` queda vacío,
// `nextCursor` pasa a null y la paginación TERMINA: ni el resto de ese día ni
// nada anterior —en ninguna fuente— se sirve jamás.
//
// Se escribe sobre las CINCO fuentes, no sobre una elegida a mano: la propiedad
// es de la clave de orden, no de una columna concreta, y las dos fuentes que hoy
// pasan (`added` y clubes, cuya cota sí depende de la hora del cursor) son las
// que demuestran que el fixture no es vacuo.
const DENSE_DAY = daysBefore(TODAY, 3);
const DENSE_OLD_DAY = daysBefore(TODAY, 10);

// 5 filas en DENSE_DAY (con pageSize 2, más del doble) y 3 en un día anterior.
// Ninguna es de HOY a propósito: así `sessionRelativeBasis` no sustituye nada y
// lo único que este recorrido ejercita es la DENSIDAD del día.
type DenseSource = {
  key: string;
  dataKey: keyof FakeFeedData;
  idPrefix: string;
  row: (id: string, stamp: string, day: string) => FakeRow;
};

const DENSE_SOURCES: DenseSource[] = [
  {
    key: "added",
    dataKey: "added",
    idPrefix: "diary_entries_added",
    row: (id, at) => ({ id, created_at: at }),
  },
  {
    key: "progressed",
    dataKey: "sessions",
    idPrefix: "progress_sessions",
    row: (id, at, day) => ({ id, session_date: day, created_at: at }),
  },
  {
    key: "diary",
    dataKey: "finished",
    idPrefix: "diary_entries",
    // El pase se creó semanas antes; el terminado se registra en `updated_at`,
    // que es la hora de registro que usa `feed.ts` para esta fuente.
    row: (id, at, day) => ({
      id,
      finished_on: day,
      created_at: stamp(daysBefore(TODAY, 40), "08:00"),
      updated_at: at,
    }),
  },
  {
    key: "episodes",
    dataKey: "episodes",
    idPrefix: "episode_watches",
    row: (id, at, day) => ({ id, watched_on: day, created_at: at }),
  },
  {
    key: "clubs",
    dataKey: "clubActivities",
    idPrefix: "club_activities",
    row: (id, at) => ({ id, created_at: at }),
  },
];

function denseFixture(source: DenseSource): { data: FakeFeedData; expected: string[] } {
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => source.row(`densa-${i}`, stamp(DENSE_DAY, `1${i}:00`), DENSE_DAY)),
    ...Array.from({ length: 3 }, (_, i) =>
      source.row(`vieja-${i}`, stamp(DENSE_OLD_DAY, `1${i}:00`), DENSE_OLD_DAY),
    ),
  ];
  return {
    data: { [source.dataKey]: rows },
    expected: rows.map((r) => `${source.idPrefix}:${String(r.id)}`).sort(),
  };
}

describe("un día con más filas que `pageSize` en una sola fuente (#346)", () => {
  for (const source of DENSE_SOURCES) {
    it(`${source.key}: sirve el día entero y sigue sirviendo lo anterior`, async () => {
      const { data, expected } = denseFixture(source);
      const { served, pages } = await walk(2, data);
      expect(new Set(served).size).toBe(served.length); // ninguna repetida
      expect([...served].sort()).toEqual(expected); // ninguna perdida
      // Si el cursor no llega a quedarse DENTRO del día denso, el recorrido no
      // ejercita la inanición y este test no prueba lo que dice probar.
      expect(cursorDay(pages, 0)).toBe(DENSE_DAY);
    });
  }
});

describe("cota de la fuente de clubes", () => {
  it("sirve cada actividad exactamente una vez dentro del mismo día", async () => {
    const { served, pages } = await walk(2, CLUB_DATA);
    expect(new Set(served).size).toBe(served.length);
    expect([...served].sort()).toEqual(CLUB_EXPECTED_IDS);
    // Todo el fixture vive DENTRO de un mismo día: si el cursor no cae ahí, la
    // cota exacta de `created_at` no se está ejercitando.
    expect(cursorDay(pages, 0)).toBe(CLUB_DAY);
  });

  it("usa la cota exacta de created_at, no el fin del día", async () => {
    const { pages } = await walk(2, CLUB_DATA);
    expect(pages.length).toBeGreaterThan(0);
    for (const { cursor, bounds } of pages) {
      expect(bounds.club_activities).toBe(addedUpperBound(parseCursor(cursor)));
    }
  });
});
