import { describe, it, expect } from "vitest";
import { getFeed } from "./feed";
import { todayISO } from "@/lib/stats/dates";

// `TODAY` se calcula con el MISMO helper que usa producción
// (`sessionRelativeBasis` cae a `todayISO()`), para que el test no dependa del
// día en que se ejecute.
const TODAY = todayISO();

const ACTOR_ID = "actor-1";
const ITEM_ID = "book-1";

type Row = Record<string, unknown>;

// Doble mínimo de Supabase: replica las cadenas de query que usa `getFeed`
// (`.from().select().in().order().limit()`, más `.lte()`/`.not()` condicionales)
// y se resuelve como `{ data, error }` al await. Devuelve las filas indicadas
// para la consulta de reseñas y listas vacías para las demás fuentes.
function fakeSupabase(rows: { finished?: Row[] }) {
  const finished = (rows.finished ?? []).map((r) => ({
    user_id: ACTOR_ID,
    item_type: "book",
    item_id: ITEM_ID,
    started_on: null,
    rating: null,
    ...r,
  }));

  // `resolveData` recibe la lista de columnas porque `getFeed` consulta
  // `passes` tres veces con selects distintos (altas, reseñas y pases del
  // visitante): la única forma de distinguirlas es por lo que piden.
  function query(resolveData: (columns: string) => Row[]) {
    let columns = "";
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ["in", "eq", "neq", "not", "order", "limit", "lte", "gte"]) {
      builder[method] = chain;
    }
    builder.select = (cols: string) => {
      columns = cols;
      return builder;
    };
    builder.then = (resolve: (value: unknown) => unknown) =>
      resolve({ data: resolveData(columns), error: null });
    return builder;
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      return query((columns) => {
        switch (table) {
          case "follows":
            return [{ followee_id: ACTOR_ID }];
          case "passes":
            // Solo la consulta de reseñas pide `finished_on`; las altas y los
            // pases del visitante piden otras columnas y van vacías.
            return columns.includes("finished_on") ? finished : [];
          case "profile_identities":
            return [
              {
                user_id: ACTOR_ID,
                username: "actor",
                display_name: null,
                avatar_url: null,
              },
            ];
          case "books":
            return [
              {
                id: ITEM_ID,
                title: "Título",
                author: null,
                cover_url: null,
                total_pages: null,
              },
            ];
          default:
            return [];
        }
      });
    },
  };

  return client as unknown as Parameters<typeof getFeed>[0];
}

describe("base del «hace x» de las fechas sin hora", () => {
  it("una reseña de hoy usa created_at, y una backdateada se queda en el día", async () => {
    const page = await getFeed(
      fakeSupabase({
        finished: [
          { id: "hoy", finished_on: TODAY, created_at: `${TODAY}T18:22:06.000+00:00` },
          { id: "vieja", finished_on: "2026-07-15", created_at: `${TODAY}T18:30:00.000+00:00` },
        ],
      }),
      "viewer-1",
    );

    const byId = new Map(page.events.map((e) => [e.id, e]));
    expect(byId.get("diary_entries:hoy")?.eventDate).toBe(`${TODAY}T18:22:06.000+00:00`);
    expect(byId.get("diary_entries:vieja")?.eventDate).toBe("2026-07-15");
  });
});
