import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { getSaga } from "./get-saga";

const external = vi.hoisted(() => ({
  getCollection: vi.fn(() => { throw new Error("TMDB fuera del fixture de saga manual"); }),
  findOrCreateCatalogItem: vi.fn(() => { throw new Error("No se escribe catálogo en este fixture"); }),
  createServiceRoleClient: vi.fn(() => { throw new Error("No se crea un cliente privilegiado en este fixture"); }),
}));

vi.mock("@/lib/catalog/tmdb", () => ({ getCollection: external.getCollection }));
vi.mock("@/lib/catalog/find-or-create", () => ({ findOrCreateCatalogItem: external.findOrCreateCatalogItem }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: external.createServiceRoleClient }));

type Tables = Database["public"]["Tables"];
type SagaRow = Pick<Tables["sagas"]["Row"],
  "id" | "name" | "overview" | "cover_url" | "source" | "tmdb_collection_id" |
  "parent_saga_id" | "accent_color" | "show_map"
>;
type MemberRow = Pick<Tables["saga_items"]["Row"],
  "saga_id" | "item_type" | "item_id" | "position" | "role" | "placement" | "optional"
>;
type CatalogRow = Pick<Tables["books"]["Row"], "id" | "title" | "cover_url">;
type FixtureRow = SagaRow | MemberRow | CatalogRow;
type Fixtures = {
  sagas: readonly SagaRow[] | null;
  saga_items: readonly MemberRow[] | null;
  books: readonly CatalogRow[] | null;
  movies: readonly CatalogRow[] | null;
  series: readonly CatalogRow[] | null;
};

const manualSaga: SagaRow = {
  id: "saga-manual",
  name: "Saga de prueba",
  overview: null,
  cover_url: null,
  source: "manual",
  tmdb_collection_id: null,
  parent_saga_id: null,
  accent_color: null,
  show_map: false,
};

function member(itemId: string, fields: Partial<MemberRow> = {}): MemberRow {
  return {
    saga_id: manualSaga.id, item_type: "book", item_id: itemId,
    position: null, role: null, placement: null, optional: false,
    ...fields,
  };
}

function catalog(id: string, title: string | null, coverUrl: string | null = null): CatalogRow {
  return { id, title, cover_url: coverUrl };
}

function columnValue(row: FixtureRow, column: string): unknown {
  if (!(column in row)) throw new Error(`Columna fuera del fixture: ${column}`);
  return (row as Record<string, unknown>)[column];
}

// Frontera de lectura: aplica filtros sobre la fila y devuelve sólo las
// columnas seleccionadas. Un select que omita placement/optional debe fallar
// por los valores públicos, aunque el fixture original tenga esos campos.
class ReadQuery {
  private columns: string[] = [];

  constructor(private rows: readonly FixtureRow[] | null) {}

  select(columns: string) {
    this.columns = columns.split(",").map((column) => column.trim());
    return this;
  }

  eq(column: string, value: unknown) {
    this.rows = this.rows?.filter((row) => columnValue(row, column) === value) ?? null;
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    this.rows = this.rows?.filter((row) => values.includes(columnValue(row, column))) ?? null;
    return this;
  }

  private project(row: FixtureRow) {
    return Object.fromEntries(this.columns.map((column) => [column, columnValue(row, column)]));
  }

  async maybeSingle() {
    if (this.rows && this.rows.length > 1) throw new Error("maybeSingle requiere como máximo una fila");
    return { data: this.rows?.[0] ? this.project(this.rows[0]) : null, error: null };
  }

  then(resolve: (result: { data: Record<string, unknown>[] | null; error: null }) => unknown) {
    return Promise.resolve({ data: this.rows?.map((row) => this.project(row)) ?? null, error: null }).then(resolve);
  }
}

function fixtureClient(overrides: Partial<Fixtures> = {}) {
  const tables: Fixtures = {
    sagas: [manualSaga], saga_items: [], books: [], movies: [], series: [],
    ...overrides,
  };
  const from = vi.fn((table: keyof Fixtures) => {
    if (!(table in tables)) throw new Error(`Tabla fuera del fixture: ${table}`);
    return new ReadQuery(tables[table]);
  });
  // Se limita el cast al cliente de prueba; las filas se atan al esquema real.
  return { client: { from } as unknown as Parameters<typeof getSaga>[0], from };
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  expect(external.getCollection).not.toHaveBeenCalled();
  expect(external.findOrCreateCatalogItem).not.toHaveBeenCalled();
  expect(external.createServiceRoleClient).not.toHaveBeenCalled();
});

describe("getSaga: miembros del editor (#191)", () => {
  it.each([
    ["precuela", "fijo", 0, true],
    ["novela_corta", "libre", null, false],
    ["relato", "libre", null, true],
    ["spin_off", "fijo", 7, false],
    ["companero", "anclado", null, false],
    ["crossover", null, null, true],
    [null, null, null, false],
  ] as const)("conserva role=%s, placement=%s, position=%s y optional=%s", async (role, placement, position, optional) => {
    const { client } = fixtureClient({
      saga_items: [member("libro", { role, placement, position, optional })],
      books: [catalog("libro", "Libro curado", "https://example.test/libro.jpg")],
    });

    const result = await getSaga(client, manualSaga.id);

    expect(result?.members).toEqual([{
      itemType: "book", itemId: "libro", title: "Libro curado",
      coverUrl: "https://example.test/libro.jpg", href: "/libro/libro",
      position, role, placement, optional,
    }]);
  });

  it("resuelve metadatos por tipo:id, con el mismo id en los tres catálogos", async () => {
    const { client } = fixtureClient({
      saga_items: [
        member("compartido", { item_type: "series", position: 3, placement: "fijo", role: "relato", optional: true }),
        member("compartido", { item_type: "book", position: 1, placement: "fijo", role: "precuela" }),
        member("compartido", { item_type: "movie", position: 2, placement: "fijo", role: "spin_off" }),
      ],
      books: [catalog("compartido", "Libro", "https://example.test/book.jpg")],
      movies: [catalog("compartido", "Película", "https://example.test/movie.jpg")],
      series: [catalog("compartido", "Serie", null)],
    });

    expect((await getSaga(client, manualSaga.id))?.members).toEqual([
      { itemType: "book", itemId: "compartido", title: "Libro", coverUrl: "https://example.test/book.jpg", href: "/libro/compartido", position: 1, role: "precuela", placement: "fijo", optional: false },
      { itemType: "movie", itemId: "compartido", title: "Película", coverUrl: "https://example.test/movie.jpg", href: "/pelicula/compartido", position: 2, role: "spin_off", placement: "fijo", optional: false },
      { itemType: "series", itemId: "compartido", title: "Serie", coverUrl: null, href: "/serie/compartido", position: 3, role: "relato", placement: "fijo", optional: true },
    ]);
  });

  it("omite miembros sin metadatos de su tipo aunque otro catálogo comparta el id", async () => {
    const { client } = fixtureClient({
      saga_items: [
        member("compartido"),
        member("compartido", { item_type: "movie" }),
        member("ausente", { item_type: "series" }),
      ],
      movies: [catalog("compartido", "Película existente")],
      series: [catalog("otra-serie", "No es miembro")],
    });

    expect((await getSaga(client, manualSaga.id))?.members).toEqual([{
      itemType: "movie", itemId: "compartido", title: "Película existente",
      coverUrl: null, href: "/pelicula/compartido",
      position: null, role: null, placement: null, optional: false,
    }]);
  });

  it.each([
    ["book", "books", "/libro"],
    ["movie", "movies", "/pelicula"],
    ["series", "series", "/serie"],
  ] as const)("un %s con título null conserva la obra y usa el fallback", async (itemType, table, basePath) => {
    const { client } = fixtureClient({
      saga_items: [member("shell", { item_type: itemType })],
      [table]: [catalog("shell", null)],
    });

    expect((await getSaga(client, manualSaga.id))?.members).toEqual([{
      itemType, itemId: "shell", title: "Sin título", coverUrl: null,
      href: `${basePath}/shell`, position: null, role: null, placement: null, optional: false,
    }]);
  });

  it("ordena posiciones numéricamente, conserva 0, deja null al final y desempata por título", async () => {
    const { client } = fixtureClient({
      saga_items: [
        member("null-zulu", { placement: "libre" }),
        member("diez", { position: 10, placement: "fijo", optional: true }),
        member("dos-zulu", { position: 2, placement: "fijo" }),
        member("cero", { position: 0, placement: "fijo" }),
        member("null-alfa", { placement: "libre", optional: true }),
        member("dos-alfa", { position: 2, placement: "fijo", optional: true }),
      ],
      // El catálogo tampoco llega en el orden esperado: ordenar sólo una
      // entrada, sólo por título o por optional no sirve para estos datos.
      books: [
        catalog("dos-zulu", "Zulu"), catalog("null-zulu", "Zulu"),
        catalog("diez", "Aardvark"), catalog("dos-alfa", "Alfa"),
        catalog("null-alfa", "Alfa"), catalog("cero", "Zebra"),
      ],
    });

    const result = await getSaga(client, manualSaga.id);

    expect(result?.members.map((entry) => entry.itemId)).toEqual([
      "cero", "dos-alfa", "dos-zulu", "diez", "null-alfa", "null-zulu",
    ]);
    expect(result?.members.map((entry) => entry.position)).toEqual([0, 2, 2, 10, null, null]);
  });

  it("lee sólo la saga solicitada y sus miembros", async () => {
    const { client } = fixtureClient({
      sagas: [{ ...manualSaga, id: "otra-saga", name: "Otra saga" }, manualSaga],
      saga_items: [member("intruso", { saga_id: "otra-saga" }), member("propio")],
      books: [catalog("intruso", "Otra saga"), catalog("propio", "Miembro propio")],
    });

    const result = await getSaga(client, manualSaga.id);

    expect(result?.saga).toEqual({
      id: "saga-manual", name: "Saga de prueba", overview: null, coverUrl: null,
      source: "manual", tmdbCollectionId: null, parentSagaId: null, accentColor: null, showMap: false,
    });
    expect(result?.members.map((entry) => entry.itemId)).toEqual(["propio"]);
  });

  it("una saga inexistente devuelve null sin consultar miembros ni catálogo", async () => {
    const { client, from } = fixtureClient();

    expect(await getSaga(client, "inexistente")).toBeNull();
    expect(from.mock.calls).toEqual([["sagas"]]);
  });

  it.each([
    { label: "vacío", rows: [] },
    { label: "null", rows: null },
  ])("saga_items $label devuelve miembros vacíos sin consultas de catálogo", async ({ rows }) => {
    const { client, from } = fixtureClient({ saga_items: rows });

    expect((await getSaga(client, manualSaga.id))?.members).toEqual([]);
    expect(from.mock.calls).toEqual([["sagas"], ["saga_items"]]);
  });

  it.each([
    { label: "vacío", rows: [] },
    { label: "null", rows: null },
  ])("catálogo $label omite el miembro sin producir un enlace roto", async ({ rows }) => {
    const { client } = fixtureClient({ saga_items: [member("sin-metadatos")], books: rows });

    expect((await getSaga(client, manualSaga.id))?.members).toEqual([]);
  });
});
