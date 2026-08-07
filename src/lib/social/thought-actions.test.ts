import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidateFeed: vi.fn(),
  notifyMentions: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateFeed: mocks.revalidateFeed }));
vi.mock("./notify-mentions", () => ({ notifyMentions: mocks.notifyMentions }));

import { createThought, deleteThought } from "./thought-actions";

// Doble mínimo: solo las tablas que `createThought` toca. `anchorFound`
// controla si la tabla del ancla (books/movies/series/sagas/people, según
// `anchorType`) devuelve fila.
function makeClient(params: {
  user: { id: string } | null;
  anchorFound?: boolean;
  insertError?: boolean;
  /** Fila que devuelve el lookup de `interaction_targets` (kind='thought')
   *  tras el insert. `undefined` (default) = ausente, igual que antes. */
  mentionTarget?: { id: string } | null;
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
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          async maybeSingle() {
            return { data: params.mentionTarget ?? null, error: null };
          },
        };
        return builder;
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

  it("resuelve el target 'thought' y notifica las menciones del cuerpo", async () => {
    const { client } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
      mentionTarget: { id: "target-thought-1" },
    });
    mocks.createClient.mockResolvedValue(client);
    mocks.notifyMentions.mockResolvedValue(["mentioned-user"]);

    const result = await createThought({
      anchorType: "book",
      anchorId: "anchor-1",
      body: "Qué razón tiene @otro con esto",
      isSpoiler: false,
    });

    expect(result).toEqual({ ok: true, id: "thought-1" });
    expect(mocks.notifyMentions).toHaveBeenCalledWith(client, {
      authorId: "actor",
      text: "Qué razón tiene @otro con esto",
      interactionTargetId: "target-thought-1",
    });
  });

  it("si notifyMentions lanza, el pensamiento sigue publicado (ok:true)", async () => {
    const { client, insertedThoughts } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
      mentionTarget: { id: "target-thought-1" },
    });
    mocks.createClient.mockResolvedValue(client);
    mocks.notifyMentions.mockRejectedValue(new Error("notify boom"));

    const result = await createThought({
      anchorType: "book",
      anchorId: "anchor-1",
      body: "@otro esto va a fallar al notificar",
      isSpoiler: false,
    });

    // El insert YA sucedió (ver insertedThoughts): un fallo de notificación,
    // best-effort, nunca debe degradar el resultado a "unknown".
    expect(result).toEqual({ ok: true, id: "thought-1" });
    expect(insertedThoughts).toHaveLength(1);
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

// deleteThought (task-delete, #525): mismo contrato discriminado que
// createThought -- el borrado real lo decide la RLS `thoughts delete own or
// moderate` (cliente de SESIÓN, nunca service-role); el resultado de la
// acción solo traduce lo que la RLS ya decidió: 0 filas devueltas = bloqueado
// o inexistente, no hay forma de distinguirlas desde aquí (ni falta que hace).
function makeDeleteClient(params: {
  user: { id: string } | null;
  deletedRows?: { id: string }[];
  deleteError?: boolean;
}) {
  const client = {
    auth: { getUser: async () => ({ data: { user: params.user } }) },
    from(table: string) {
      if (table !== "thoughts") throw new Error(`Tabla inesperada: ${table}`);
      const builder = {
        delete() {
          return builder;
        },
        eq() {
          return builder;
        },
        async select() {
          if (params.deleteError) return { data: null, error: new Error("db error") };
          return { data: params.deletedRows ?? [], error: null };
        },
      };
      return builder;
    },
  };
  return { client };
}

describe("deleteThought", () => {
  it("no autenticado -> error unauthenticated", async () => {
    const { client } = makeDeleteClient({ user: null });
    mocks.createClient.mockResolvedValue(client);

    const result = await deleteThought("thought-1");

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("feliz: borra y revalida el feed", async () => {
    const { client } = makeDeleteClient({
      user: { id: "actor" },
      deletedRows: [{ id: "thought-1" }],
    });
    mocks.createClient.mockResolvedValue(client);

    const result = await deleteThought("thought-1");

    expect(result).toEqual({ ok: true });
    expect(mocks.revalidateFeed).toHaveBeenCalledOnce();
  });

  it("la RLS bloquea el borrado (0 filas) -> error not_allowed_or_missing, sin revalidar", async () => {
    const { client } = makeDeleteClient({ user: { id: "actor" }, deletedRows: [] });
    mocks.createClient.mockResolvedValue(client);

    const result = await deleteThought("thought-ajeno");

    expect(result).toEqual({ ok: false, error: "not_allowed_or_missing" });
    expect(mocks.revalidateFeed).not.toHaveBeenCalled();
  });

  it("fallo inesperado -> error unknown, nunca lanza", async () => {
    const { client } = makeDeleteClient({ user: { id: "actor" }, deleteError: true });
    mocks.createClient.mockResolvedValue(client);

    const result = await deleteThought("thought-1");

    expect(result).toEqual({ ok: false, error: "unknown" });
  });
});
