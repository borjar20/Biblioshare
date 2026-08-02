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

// Las tres fuentes con columna `date` y su columna filtrada, para poder afirmar
// la propiedad de superconjunto sobre cada una.
const DATE_ONLY_SOURCES = [
  { key: "diary", column: "finished_on", idPrefix: "diary_entries", dataKey: "finished" },
  { key: "progress_sessions", column: "session_date", idPrefix: "progress_sessions", dataKey: "sessions" },
  { key: "episode_watches", column: "watched_on", idPrefix: "episode_watches", dataKey: "episodes" },
] as const;

const DIVERGENT_DATA: FakeFeedData = {
  finished: divergentRows("resena", "finished_on", 0),
  sessions: divergentRows("sesion", "session_date", 1),
  episodes: divergentRows("episodio", "watched_on", 2),
};

const DIVERGENT_EXPECTED_IDS = DATE_ONLY_SOURCES.flatMap((s) =>
  (DIVERGENT_DATA[s.dataKey] ?? []).map((r) => `${s.idPrefix}:${r.id}`),
).sort();

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

describe("cotas de cursor de getFeed", () => {
  it("sirve cada fila exactamente una vez paginando hasta agotar el feed", async () => {
    const { served } = await walk(5);
    expect(new Set(served).size).toBe(served.length); // ninguna repetida
    expect([...served].sort()).toEqual(EXPECTED_IDS); // ninguna perdida
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
    const { served } = await walk(2, DIVERGENT_DATA);
    expect(new Set(served).size).toBe(served.length);
    expect([...served].sort()).toEqual(DIVERGENT_EXPECTED_IDS);
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
          const entry = {
            eventDate: sessionRelativeBasis(column, String(row.created_at)),
            sortDate: String(row.created_at),
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

describe("cota de la fuente de clubes", () => {
  it("sirve cada actividad exactamente una vez dentro del mismo día", async () => {
    const { served } = await walk(2, CLUB_DATA);
    expect(new Set(served).size).toBe(served.length);
    expect([...served].sort()).toEqual(CLUB_EXPECTED_IDS);
  });

  it("usa la cota exacta de created_at, no el fin del día", async () => {
    const { pages } = await walk(2, CLUB_DATA);
    expect(pages.length).toBeGreaterThan(0);
    for (const { cursor, bounds } of pages) {
      expect(bounds.club_activities).toBe(addedUpperBound(parseCursor(cursor)));
    }
  });
});
