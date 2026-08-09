import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidateFeed: vi.fn(),
  notifyMentions: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateFeed: mocks.revalidateFeed }));
vi.mock("./notify-mentions", () => ({ notifyMentions: mocks.notifyMentions }));

import { createPost, deletePost } from "./post-actions";

// Doble mínimo: solo las tablas que `createPost` toca. `anchorFound` controla
// si la tabla del ancla (books/movies/series/sagas/people, según `anchorType`)
// devuelve fila. `mentionTarget` es la fila que devuelve el lookup de
// `interaction_targets` (kind='post') tras el insert.
function makeClient(params: {
  user: { id: string } | null;
  anchorFound?: boolean;
  insertError?: boolean;
  mentionTarget?: { id: string } | null;
}) {
  const insertedPosts: Record<string, unknown>[] = [];

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
      if (table === "posts") {
        return {
          insert(payload: Record<string, unknown>) {
            insertedPosts.push(payload);
            const result = {
              select() {
                return result;
              },
              async single() {
                if (params.insertError) return { data: null, error: new Error("db error") };
                return { data: { id: "post-1" }, error: null };
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

  return { client, insertedPosts };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPost", () => {
  it("thought sin sesión -> error unauthenticated", async () => {
    const { client } = makeClient({ user: null });
    mocks.createClient.mockResolvedValue(client);

    const result = await createPost({
      kind: "thought",
      anchorType: "book",
      anchorId: "anchor-1",
      body: "hola",
    });

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("thought con body vacío (solo espacios) -> error empty", async () => {
    const { client } = makeClient({ user: { id: "actor" }, anchorFound: true });
    mocks.createClient.mockResolvedValue(client);

    const result = await createPost({
      kind: "thought",
      anchorType: "book",
      anchorId: "anchor-1",
      body: "   ",
    });

    expect(result).toEqual({ ok: false, error: "empty" });
  });

  it("thought sin body (undefined) -> error empty", async () => {
    const { client } = makeClient({ user: { id: "actor" }, anchorFound: true });
    mocks.createClient.mockResolvedValue(client);

    const result = await createPost({
      kind: "thought",
      anchorType: "book",
      anchorId: "anchor-1",
    });

    expect(result).toEqual({ ok: false, error: "empty" });
  });

  it("body > 2000 caracteres -> error too_long", async () => {
    const { client } = makeClient({ user: { id: "actor" }, anchorFound: true });
    mocks.createClient.mockResolvedValue(client);

    const result = await createPost({
      kind: "thought",
      anchorType: "book",
      anchorId: "anchor-1",
      body: "a".repeat(2001),
    });

    expect(result).toEqual({ ok: false, error: "too_long" });
  });

  it("ancla inexistente -> error anchor_not_found", async () => {
    const { client } = makeClient({ user: { id: "actor" }, anchorFound: false });
    mocks.createClient.mockResolvedValue(client);

    const result = await createPost({
      kind: "thought",
      anchorType: "saga",
      anchorId: "anchor-missing",
      body: "Pensamiento",
    });

    expect(result).toEqual({ ok: false, error: "anchor_not_found" });
  });

  it("finished sin body -> ok (body opcional en hitos), inserta body/source null", async () => {
    const { client, insertedPosts } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
    });
    mocks.createClient.mockResolvedValue(client);

    const result = await createPost({
      kind: "finished",
      anchorType: "book",
      anchorId: "anchor-1",
    });

    expect(result).toEqual({ ok: true, id: "post-1" });
    expect(insertedPosts).toEqual([
      {
        author_id: "actor",
        kind: "finished",
        anchor_type: "book",
        anchor_id: "anchor-1",
        source_kind: null,
        source_id: null,
        body: null,
        is_spoiler: false,
      },
    ]);
    expect(mocks.revalidateFeed).toHaveBeenCalledOnce();
  });

  it("feliz: thought recorta el body, arrastra source, revalida el feed", async () => {
    const { client, insertedPosts } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
    });
    mocks.createClient.mockResolvedValue(client);
    mocks.notifyMentions.mockResolvedValue([]);

    const result = await createPost({
      kind: "watched",
      anchorType: "movie",
      anchorId: "anchor-1",
      sourceKind: "episode_watch",
      sourceId: "watch-1",
      body: "  Qué buen giro final  ",
      isSpoiler: true,
    });

    expect(result).toEqual({ ok: true, id: "post-1" });
    expect(insertedPosts).toEqual([
      {
        author_id: "actor",
        kind: "watched",
        anchor_type: "movie",
        anchor_id: "anchor-1",
        source_kind: "episode_watch",
        source_id: "watch-1",
        body: "Qué buen giro final",
        is_spoiler: true,
      },
    ]);
    expect(mocks.revalidateFeed).toHaveBeenCalledOnce();
  });

  it("resuelve el target 'post' y notifica las menciones del cuerpo", async () => {
    const { client } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
      mentionTarget: { id: "target-post-1" },
    });
    mocks.createClient.mockResolvedValue(client);
    mocks.notifyMentions.mockResolvedValue(["mentioned-user"]);

    const result = await createPost({
      kind: "thought",
      anchorType: "book",
      anchorId: "anchor-1",
      body: "Qué razón tiene @otro con esto",
    });

    expect(result).toEqual({ ok: true, id: "post-1" });
    expect(mocks.notifyMentions).toHaveBeenCalledWith(client, {
      authorId: "actor",
      text: "Qué razón tiene @otro con esto",
      interactionTargetId: "target-post-1",
    });
  });

  it("si notifyMentions lanza, el post sigue publicado (ok:true)", async () => {
    const { client, insertedPosts } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
      mentionTarget: { id: "target-post-1" },
    });
    mocks.createClient.mockResolvedValue(client);
    mocks.notifyMentions.mockRejectedValue(new Error("notify boom"));

    const result = await createPost({
      kind: "thought",
      anchorType: "book",
      anchorId: "anchor-1",
      body: "@otro esto va a fallar al notificar",
    });

    expect(result).toEqual({ ok: true, id: "post-1" });
    expect(insertedPosts).toHaveLength(1);
    expect(mocks.revalidateFeed).toHaveBeenCalledOnce();
  });

  it("fallo inesperado en el insert -> error unknown, nunca lanza", async () => {
    const { client } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
      insertError: true,
    });
    mocks.createClient.mockResolvedValue(client);

    const result = await createPost({
      kind: "thought",
      anchorType: "book",
      anchorId: "anchor-1",
      body: "Pensamiento",
    });

    expect(result).toEqual({ ok: false, error: "unknown" });
  });
});

// deletePost: espejo de deleteThought -- el borrado real lo decide la RLS
// `posts delete own or moderate` (cliente de SESIÓN, nunca service-role); 0
// filas devueltas = bloqueado o inexistente, sin forma de distinguirlas.
function makeDeleteClient(params: {
  user: { id: string } | null;
  deletedRows?: { id: string }[];
  deleteError?: boolean;
}) {
  const client = {
    auth: { getUser: async () => ({ data: { user: params.user } }) },
    from(table: string) {
      if (table !== "posts") throw new Error(`Tabla inesperada: ${table}`);
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

describe("deletePost", () => {
  it("no autenticado -> error unauthenticated", async () => {
    const { client } = makeDeleteClient({ user: null });
    mocks.createClient.mockResolvedValue(client);

    const result = await deletePost("post-1");

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("feliz: borra y revalida el feed", async () => {
    const { client } = makeDeleteClient({
      user: { id: "actor" },
      deletedRows: [{ id: "post-1" }],
    });
    mocks.createClient.mockResolvedValue(client);

    const result = await deletePost("post-1");

    expect(result).toEqual({ ok: true });
    expect(mocks.revalidateFeed).toHaveBeenCalledOnce();
  });

  it("la RLS bloquea el borrado (0 filas) -> error not_allowed_or_missing, sin revalidar", async () => {
    const { client } = makeDeleteClient({ user: { id: "actor" }, deletedRows: [] });
    mocks.createClient.mockResolvedValue(client);

    const result = await deletePost("post-ajeno");

    expect(result).toEqual({ ok: false, error: "not_allowed_or_missing" });
    expect(mocks.revalidateFeed).not.toHaveBeenCalled();
  });

  it("fallo inesperado -> error unknown, nunca lanza", async () => {
    const { client } = makeDeleteClient({ user: { id: "actor" }, deleteError: true });
    mocks.createClient.mockResolvedValue(client);

    const result = await deletePost("post-1");

    expect(result).toEqual({ ok: false, error: "unknown" });
  });
});
