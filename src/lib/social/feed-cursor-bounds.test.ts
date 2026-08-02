import { describe, it, expect } from "vitest";
import { getFeed } from "./feed";
import { addedUpperBound, parseCursor } from "./feed-order";
import { fakeSupabase } from "./fake-feed-supabase";
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

const DATA = { added: [...addedToday, ...addedOld], finished: reviews };

type Walk = {
  served: string[];
  /** Cota que feed.ts pasó a la fuente `added` en cada página con cursor. */
  addedBounds: string[];
  /** La que exige el orden total, recalculada desde el cursor servido. */
  expectedBounds: string[];
};

async function walk(pageSize: number): Promise<Walk> {
  const served: string[] = [];
  const addedBounds: string[] = [];
  const expectedBounds: string[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 20; guard++) {
    // Un doble por página: así `lteCalls` recoge las cotas de ESA página.
    const fake = fakeSupabase(DATA);
    const page = await getFeed(fake.client, "viewer-1", { cursor, pageSize });
    if (cursor) {
      addedBounds.push(fake.lteCalls.added?.[0]?.value ?? "(sin cota)");
      expectedBounds.push(addedUpperBound(parseCursor(cursor)));
    }
    for (const entry of page.events) {
      if (entry.source === "person-group") served.push(...entry.items.map((e) => e.id));
      else served.push(entry.id);
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return { served, addedBounds, expectedBounds };
}

describe("cotas de cursor de getFeed", () => {
  it("sirve cada fila exactamente una vez paginando hasta agotar el feed", async () => {
    const { served } = await walk(5);
    expect(new Set(served).size).toBe(served.length); // ninguna repetida
    expect([...served].sort()).toEqual(EXPECTED_IDS); // ninguna perdida
  });

  it("la cota de `added` coincide con el supremo de lo que acepta isAfterCursor", async () => {
    const { addedBounds, expectedBounds } = await walk(5);
    expect(addedBounds.length).toBeGreaterThan(0);
    expect(addedBounds).toEqual(expectedBounds);
  });
});
