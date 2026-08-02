import { describe, expect, it } from "vitest";
import { getRecentReviews } from "./recent-reviews";
import { resolveSharedActivity } from "./shared-activity";

// Contrato de `FeedEvent.sortDate`: SIEMPRE un timestamp real (created_at).
// `pass_reviews` es una VISTA y los tipos generados marcan todas sus columnas
// nullable, así que es tentador caer a `finished_on` — pero eso mete un valor
// date-only donde el resto del sistema espera hora, y reintroduce los dos
// defectos que este trabajo quita:
//   · "2026-07-15" < "2026-07-15T09:00+00:00" como cadena: la fila cae por
//     debajo de TODO evento con hora de su mismo día.
//   · dos filas así empatan y el desempate se lo lleva un uuid aleatorio.
// El resto de columnas nullables de la vista (id/user_id/item_type/item_id) ya
// se narrowan; created_at tiene que ir por el mismo camino.

const USER_ID = "user-1";
const ITEM_ID = "book-1";

type Row = Record<string, unknown>;

// Doble mínimo: devuelve las filas indicadas por tabla y soporta `maybeSingle`
// (fila suelta) además del await normal (lista).
function fakeSupabase(rowsByTable: Record<string, Row[]>) {
  function query(table: string) {
    let single = false;
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ["select", "in", "eq", "neq", "not", "order", "limit", "lte", "gte"]) {
      builder[method] = chain;
    }
    builder.maybeSingle = () => {
      single = true;
      return builder;
    };
    builder.then = (resolve: (value: unknown) => unknown) => {
      const rows = rowsByTable[table] ?? [];
      return resolve({ data: single ? (rows[0] ?? null) : rows, error: null });
    };
    return builder;
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => query(table),
  };
  return client as unknown as Parameters<typeof getRecentReviews>[0];
}

const IDENTITY = {
  user_id: USER_ID,
  username: "actor",
  display_name: null,
  avatar_url: null,
};
const BOOK = { id: ITEM_ID, title: "Título", author: null, cover_url: null };

function review(overrides: Row): Row {
  return {
    id: "resena-ok",
    user_id: USER_ID,
    item_type: "book",
    item_id: ITEM_ID,
    finished_on: "2026-07-15",
    rating: null,
    review: "texto",
    created_at: "2026-07-20T09:00:00.000+00:00",
    ...overrides,
  };
}

describe("sortDate nunca es date-only", () => {
  it("getRecentReviews no sirve una reseña sin created_at con la fecha semántica", async () => {
    const events = await getRecentReviews(
      fakeSupabase({
        pass_reviews: [review({ id: "sin-hora", created_at: null }), review({})],
        profile_identities: [IDENTITY],
        books: [BOOK],
      }),
      USER_ID,
    );

    // La fila sana sigue apareciendo; la que no tiene hora real se descarta
    // igual que ya se descartan las que no tienen id/item_type/item_id.
    expect(events.map((e) => e.id)).toEqual(["diary_entries:resena-ok"]);
    for (const e of events) expect(e.sortDate).toContain("T");
  });

  it("resolveSharedActivity trata una reseña sin created_at como no disponible", async () => {
    const resolved = await resolveSharedActivity(
      fakeSupabase({
        pass_reviews: [review({ id: "sin-hora", created_at: null })],
        profile_identities: [IDENTITY],
        books: [BOOK],
      }),
      { sourceTable: "diary_entries", rowId: "sin-hora" },
    );

    expect(resolved).toBeNull();
  });
});
