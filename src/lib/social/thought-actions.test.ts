import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidateFeed: vi.fn(),
  notifyMentions: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateFeed: mocks.revalidateFeed }));
vi.mock("./notify-mentions", () => ({ notifyMentions: mocks.notifyMentions }));

import { createThought } from "./thought-actions";

// Doble mínimo: solo las tablas que `createThought` toca. `anchorFound`
// controla si la tabla del ancla (books/movies/series/sagas/people, según
// `anchorType`) devuelve fila.
function makeClient(params: {
  user: { id: string } | null;
  anchorFound?: boolean;
  insertError?: boolean;
}) {
  const insertedThoughts: Record<string, unknown>[] = [];

  function anchorTableQuery() {
    const builder = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      async maybeSingle() {
        return { data: params.anchorFound ? { id: "anchor-1" } : null, error: null };
      },
    };
    return builder;
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: params.user } }) },
    from(table: string) {
      if (["books", "movies", "series", "sagas", "people"].includes(table)) {
        return anchorTableQuery();
      }
      if (table === "thoughts") {
        return {
          insert(payload: Record<string, unknown>) {
            insertedThoughts.push(payload);
            const result = {
              select() {
                return result;
              },
              async single() {
                if (params.insertError) return { data: null, error: new Error("db error") };
                return { data: { id: "thought-1" }, error: null };
              },
            };
            return result;
          },
        };
      }
      if (table === "interaction_targets") {
        // No se ejercita la resolución de menciones en detalle aquí (tiene su
        // propia cobertura en notify-mentions.test.ts / interaction-actions
        // vía addComment); un target ausente basta para que createThought
        // no intente notificar y siga siendo un no-op inocuo.
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return { data: null, error: null };
          },
        };
      }
      throw new Error(`Tabla inesperada: ${table}`);
    },
  };

  return { client, insertedThoughts };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createThought", () => {
  it("no autenticado -> error unauthenticated", async () => {
    const { client } = makeClient({ user: null });
    mocks.createClient.mockResolvedValue(client);

    const result = await createThought({
      anchorType: "book",
      anchorId: "anchor-1",
      body: "Hola",
      isSpoiler: false,
    });

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("body vacío (solo espacios) -> error empty", async () => {
    const { client } = makeClient({ user: { id: "actor" }, anchorFound: true });
    mocks.createClient.mockResolvedValue(client);

    const result = await createThought({
      anchorType: "book",
      anchorId: "anchor-1",
      body: "   ",
      isSpoiler: false,
    });

    expect(result).toEqual({ ok: false, error: "empty" });
  });

  it("body > 2000 caracteres -> error too_long", async () => {
    const { client } = makeClient({ user: { id: "actor" }, anchorFound: true });
    mocks.createClient.mockResolvedValue(client);

    const result = await createThought({
      anchorType: "book",
      anchorId: "anchor-1",
      body: "a".repeat(2001),
      isSpoiler: false,
    });

    expect(result).toEqual({ ok: false, error: "too_long" });
  });

  it("ancla inexistente -> error anchor_not_found", async () => {
    const { client } = makeClient({ user: { id: "actor" }, anchorFound: false });
    mocks.createClient.mockResolvedValue(client);

    const result = await createThought({
      anchorType: "saga",
      anchorId: "anchor-missing",
      body: "Pensamiento",
      isSpoiler: false,
    });

    expect(result).toEqual({ ok: false, error: "anchor_not_found" });
  });

  it("feliz: inserta la fila y revalida el feed", async () => {
    const { client, insertedThoughts } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
    });
    mocks.createClient.mockResolvedValue(client);
    mocks.notifyMentions.mockResolvedValue([]);

    const result = await createThought({
      anchorType: "book",
      anchorId: "anchor-1",
      body: "  Qué buen giro final  ",
      isSpoiler: true,
    });

    expect(result).toEqual({ ok: true, id: "thought-1" });
    expect(insertedThoughts).toEqual([
      {
        user_id: "actor",
        anchor_type: "book",
        anchor_id: "anchor-1",
        body: "Qué buen giro final",
        is_spoiler: true,
      },
    ]);
    expect(mocks.revalidateFeed).toHaveBeenCalledOnce();
  });

  it("fallo inesperado en el insert -> error unknown, nunca lanza", async () => {
    const { client } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
      insertError: true,
    });
    mocks.createClient.mockResolvedValue(client);

    const result = await createThought({
      anchorType: "book",
      anchorId: "anchor-1",
      body: "Pensamiento",
      isSpoiler: false,
    });

    expect(result).toEqual({ ok: false, error: "unknown" });
  });
});
