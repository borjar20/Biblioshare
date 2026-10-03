import { describe, expect, it } from "vitest";
import { getLibraryView } from "@/lib/library/get-library-items";
import { getCollection, getUncollectedItems } from "@/lib/library/collections";
import type { MediaStatus } from "./types";

// The real consumers, hydration, genres and splitDropped all run. This fake
// implements only the read boundary, using the same rows across every table.
type Row = Record<string, unknown>;
class ReadQuery {
  private columns: string[] = [];
  private filters: ((row: Row) => boolean)[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private bounds: [number, number] | null = null;
  private single = false;

  constructor(private readonly rows: Row[]) {}
  select(columns: string) { this.columns = columns.split(",").map((column) => column.trim()); return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((row) => row[column] !== value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  not(column: string, operator: string, value: unknown) {
    if (operator !== "is") throw new Error(`Unsupported fixture operator: ${operator}`);
    this.filters.push((row) => row[column] !== value); return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending !== false }); return this;
  }
  range(from: number, to: number) { this.bounds = [from, to]; return this; }
  maybeSingle() { this.single = true; return this; }
  then(resolve: (value: { data: Row[] | Row | null; error: null }) => unknown) {
    let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    data = [...data].sort((left, right) => {
      for (const { column, ascending } of this.orders) {
        const a = left[column]; const b = right[column];
        const difference = typeof a === "number" && typeof b === "number"
          ? a - b : String(a ?? "").localeCompare(String(b ?? ""));
        if (difference) return ascending ? difference : -difference;
      }
      return 0;
    });
    if (this.bounds) data = data.slice(this.bounds[0], this.bounds[1] + 1);
    const projected = data.map((row) => Object.fromEntries(this.columns.map((column) => [column, row[column]])));
    return Promise.resolve({ data: this.single ? projected[0] ?? null : projected, error: null }).then(resolve);
  }
}

const USER = "fixture-owner";
const COLLECTION = "fixture-collection";
const VISIBLE_IDS = ["visible-one", "visible-two", "visible-three"];
const DROPPED_IDS = ["dropped-match", "dropped-other-title", "dropped-other-genre"];
const seed: { id: string; title: string; genre: string; status: MediaStatus; rating: number }[] = [
  { id: DROPPED_IDS[0], title: "AA Viaje abandonado", genre: "Fantasía", status: "dropped", rating: 5 },
  { id: DROPPED_IDS[1], title: "AB Memorias abandonadas", genre: "Fantasía", status: "dropped", rating: 5 },
  { id: DROPPED_IDS[2], title: "AC Viaje de terror", genre: "Terror", status: "dropped", rating: 5 },
  { id: VISIBLE_IDS[0], title: "BA Viaje uno", genre: "Fantasía", status: "planned", rating: 1 },
  { id: VISIBLE_IDS[1], title: "BB Viaje dos", genre: "Fantasía", status: "in_progress", rating: 3 },
  { id: VISIBLE_IDS[2], title: "BC Viaje tres", genre: "Fantasía", status: "completed", rating: 5 },
];

function libraryFixture(options: { collected?: string[]; onlyVisible?: boolean; orphanInCollection?: boolean } = {}) {
  const samples = options.onlyVisible ? seed.filter((item) => item.status !== "dropped") : seed;
  const passes: Row[] = samples.flatMap((item, index) => {
    const common = {
      item_type: "book", item_id: item.id, user_id: USER,
      position: null, pinned_order: null, edition_id: null,
    };
    return [
      { ...common, id: `active-${item.id}`, is_active: true, status: item.status,
        created_at: "2026-10-02T00:00:00Z", finished_on: ["dropped", "completed"].includes(item.status) ? "2026-10-02" : null,
        updated_at: `2026-10-03T${String(20 - index).padStart(2, "0")}:00:00Z`, rating: item.rating },
      { ...common, id: `closed-${item.id}`, is_active: false, status: "completed",
        created_at: "2026-09-01T00:00:00Z", finished_on: "2026-09-01", updated_at: "2026-09-01T00:00:00Z", rating: item.rating },
    ];
  });
  const books: Row[] = samples.map((item) => ({
    id: item.id, title: item.title, genres: [item.genre], author: "Fixture Author", cover_url: null,
    publisher: "Fixture Publisher", total_pages: 120,
  }));
  const collected = [...(options.collected ?? [])];
  if (options.orphanInCollection) {
    // A catalog item can be in a collection without an active library pass.
    books.push({ id: "untracked", title: "Colección sin pase activo", genres: ["Fantasía"], author: "Fixture Author", cover_url: null, publisher: null, total_pages: 120 });
    collected.push("untracked");
  }
  const tables = new Map<string, Row[]>([
    ["passes", passes], ["books", books], ["movies", []], ["series", []], ["book_editions", []],
    ["pass_reviews", passes.map((pass) => ({ id: pass.id, review: null }))],
    ["collections", [{ id: COLLECTION, user_id: USER, name: "Colección de prueba", description: null, is_sorteable: false }]],
    ["collection_items", collected.map((id, position) => ({ collection_id: COLLECTION, item_type: "book", item_id: id, position, added_at: "2026-10-03T00:00:00Z" }))],
  ]);
  return {
    from(table: string) {
      const rows = tables.get(table);
      if (!rows) throw new Error(`Unexpected fixture table: ${table}`);
      return new ReadQuery(rows);
    },
  } as unknown as Parameters<typeof getLibraryView>[0];
}

describe("getLibraryView — dropped ordering (#773)", () => {
  it("D3: los abandonados fuera de búsqueda no inflan el contador", async () => {
    const view = await getLibraryView(libraryFixture(), USER, { search: "viaje", hideDropped: true, sort: "title" });
    expect(view.items.map((item) => item.itemId)).toEqual(VISIBLE_IDS);
    expect(view.items[0].title).toBe("BA Viaje uno");
    expect(view.hiddenDropped).toBe(2); expect(view.total).toBe(3);
  });

  it("D3: los abandonados de otro género no inflan el contador", async () => {
    const view = await getLibraryView(libraryFixture(), USER, { genre: "fantasia", hideDropped: true, sort: "title" });
    expect(view.items.map((item) => item.itemId)).toEqual(VISIBLE_IDS);
    expect(view.hiddenDropped).toBe(2); expect(view.total).toBe(3);
  });

  it("D3: búsqueda y género combinados cuentan solo el abandono que pasa ambos", async () => {
    const view = await getLibraryView(libraryFixture(), USER, { search: "viaje", genre: "fantasia", hideDropped: true });
    expect(view.items.map((item) => item.itemId)).toEqual(VISIBLE_IDS);
    expect(view.hiddenDropped).toBe(1); expect(view.total).toBe(3);
  });

  it("D3: ningún resultado de búsqueda significa cero abandonados ocultos", async () => {
    const view = await getLibraryView(libraryFixture(), USER, { search: "inexistente", genre: "fantasia", hideDropped: true });
    expect(view).toEqual({ items: [], hiddenDropped: 0, total: 0 });
  });

  it("D4: varios abandonados anteriores no consumen las dos plazas visibles", async () => {
    const view = await getLibraryView(libraryFixture(), USER, { hideDropped: true, sort: "title", limit: 2 });
    expect(view.items.map((item) => item.itemId)).toEqual(VISIBLE_IDS.slice(0, 2));
    expect(view.hiddenDropped).toBe(3); expect(view.total).toBe(3);
  });

  it("D4: limit cero conserva los totales de la población completa", async () => {
    const view = await getLibraryView(libraryFixture(), USER, { hideDropped: true, limit: 0 });
    expect(view).toEqual({ items: [], hiddenDropped: 3, total: 3 });
  });

  it("mostrar abandonados conserva el que coincide con búsqueda y género y cuenta cero ocultos", async () => {
    const view = await getLibraryView(libraryFixture(), USER, { search: "viaje", genre: "fantasia", hideDropped: false });
    expect(view.items.map((item) => item.itemId)).toEqual([DROPPED_IDS[0], ...VISIBLE_IDS]);
    expect(view.hiddenDropped).toBe(0); expect(view.total).toBe(4);
  });

  it("el estado explícito dropped gana a la preferencia de ocultación", async () => {
    const view = await getLibraryView(libraryFixture(), USER, { status: "dropped", hideDropped: true, sort: "title" });
    expect(view.items.map((item) => item.itemId)).toEqual(DROPPED_IDS);
    expect(view.hiddenDropped).toBe(0); expect(view.total).toBe(3);
  });

  it("una biblioteca con resultados pero sin abandonos no inventa ocultos", async () => {
    const view = await getLibraryView(libraryFixture({ onlyVisible: true }), USER, { hideDropped: true });
    expect(view.items.map((item) => item.itemId)).toEqual(VISIBLE_IDS);
    expect(view.hiddenDropped).toBe(0); expect(view.total).toBe(3);
  });
});

describe("getUncollectedItems — actual population and limit (#773)", () => {
  it("D4: llena el límite con visibles tras excluir la colección y ocultar dos abandonados anteriores", async () => {
    const view = await getUncollectedItems(libraryFixture({ collected: [DROPPED_IDS[0]] }), USER, 2, true);
    expect(view.items.map((item) => item.itemId)).toEqual(VISIBLE_IDS.slice(0, 2));
    expect(view.items[0].title).toBe("BA Viaje uno");
    expect(view.hiddenDropped).toBe(2); expect(view.total).toBe(3);
  });

  it("el contador no incluye ni el abandono ni el visible que ya pertenecen a una colección", async () => {
    const view = await getUncollectedItems(libraryFixture({ collected: [DROPPED_IDS[0], VISIBLE_IDS[0]] }), USER, 1, true);
    expect(view.items.map((item) => item.itemId)).toEqual([VISIBLE_IDS[1]]);
    expect(view.hiddenDropped).toBe(2); expect(view.total).toBe(2);
  });

  it("mostrar abandonados conserva las primeras claves no coleccionadas y cuenta cero ocultos", async () => {
    const view = await getUncollectedItems(libraryFixture({ collected: [DROPPED_IDS[0]] }), USER, 2, false);
    expect(view.items.map((item) => item.itemId)).toEqual(DROPPED_IDS.slice(1));
    expect(view.hiddenDropped).toBe(0); expect(view.total).toBe(5);
  });

  it("sin abandonos conserva visibles y total antes del límite", async () => {
    const view = await getUncollectedItems(libraryFixture({ onlyVisible: true }), USER, 2, true);
    expect(view.items.map((item) => item.itemId)).toEqual(VISIBLE_IDS.slice(0, 2));
    expect(view.hiddenDropped).toBe(0); expect(view.total).toBe(3);
  });
});

describe("getCollection — hiding, count and average (#773)", () => {
  const allIds = [...DROPPED_IDS, ...VISIBLE_IDS];

  it("oculta los abandonos reales después de hidratar y calcula la media solo sobre visibles", async () => {
    const detail = await getCollection(libraryFixture({ collected: allIds, orphanInCollection: true }), USER, COLLECTION, true);
    expect(detail?.items.map((item) => item.itemId)).toEqual(VISIBLE_IDS);
    expect(detail?.items[0].title).toBe("BA Viaje uno");
    expect(detail?.hiddenDropped).toBe(3);
    expect(detail?.avgRating).toBe(3); // ratings visibles 1, 3 y 5; abandonos = 5.
  });

  it("el control sin ocultación muestra los seis títulos y su media conjunta", async () => {
    const detail = await getCollection(libraryFixture({ collected: allIds }), USER, COLLECTION, false);
    expect(detail?.items.map((item) => item.itemId)).toEqual(allIds);
    expect(detail?.hiddenDropped).toBe(0); expect(detail?.avgRating).toBe(4);
  });

  it("una colección no vacía sin abandonos cuenta cero ocultos y conserva su media", async () => {
    const detail = await getCollection(libraryFixture({ collected: VISIBLE_IDS, onlyVisible: true }), USER, COLLECTION, true);
    expect(detail?.items.map((item) => item.itemId)).toEqual(VISIBLE_IDS);
    expect(detail?.hiddenDropped).toBe(0); expect(detail?.avgRating).toBe(3);
  });
});
