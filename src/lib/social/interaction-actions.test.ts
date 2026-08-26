import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidateInteraction: vi.fn(),
  notify: vi.fn(),
  notifyMentions: vi.fn(),
  deleteVoiceNote: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateInteraction: mocks.revalidateInteraction,
}));
vi.mock("@/lib/storage/voice-notes", () => ({ deleteVoiceNote: mocks.deleteVoiceNote }));
vi.mock("./notifications", () => ({ notify: mocks.notify }));
vi.mock("./notify-mentions", () => ({ notifyMentions: mocks.notifyMentions }));
vi.mock("./interaction-target-gate", () => ({
  getInteractionTarget: async (supabase: any, interactionTargetId: string) => {
    const { data, error } = await supabase
      .from("interaction_targets")
      .select(
        "id, owner_id, commentable, reactable, comment_notification_type, reaction_notification_type",
      )
      .eq("id", interactionTargetId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("interaction_target_not_found");
    return data;
  },
}));

import { addComment, deleteComment, toggleReaction } from "./interaction-actions";

type TargetRow = {
  id: string;
  kind: string;
  source_id: string;
  owner_id: string;
  commentable: boolean;
  reactable: boolean;
  comment_notification_type: string | null;
  reaction_notification_type: string | null;
};

function makeActionClient(params: {
  target: TargetRow | null;
  commentTarget?: TargetRow | null;
  existingReactionId?: string;
}) {
  const insertedReactions: Record<string, unknown>[] = [];
  const insertedComments: Record<string, unknown>[] = [];
  const deletedReactionFilters: Array<[string, unknown]> = [];

  function interactionTargetQuery() {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      async maybeSingle() {
        const byId = filters.find(([column]) => column === "id");
        if (byId) return { data: params.target, error: null };
        const kind = filters.find(([column]) => column === "kind")?.[1];
        return { data: kind === "comment" ? (params.commentTarget ?? null) : null, error: null };
      },
    };
    return builder;
  }

  function reactionQuery() {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select() {
        return builder;
      },
      delete() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        deletedReactionFilters.push([column, value]);
        return builder;
      },
      async maybeSingle() {
        return {
          data: params.existingReactionId ? { id: params.existingReactionId } : null,
          error: null,
        };
      },
      then(resolve: (value: unknown) => void) {
        resolve({ error: null });
      },
    };
    return {
      ...builder,
      insert(payload: Record<string, unknown>) {
        insertedReactions.push(payload);
        return Promise.resolve({ error: null });
      },
    };
  }

  function commentQuery() {
    return {
      insert(payload: Record<string, unknown>) {
        insertedComments.push(payload);
        const result = {
          select() {
            return result;
          },
          async single() {
            return { data: { id: "comment-1" }, error: null };
          },
        };
        return result;
      },
    };
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) },
    from(table: string) {
      if (table === "interaction_targets") return interactionTargetQuery();
      if (table === "reactions") return reactionQuery();
      if (table === "comments") return commentQuery();
      throw new Error(`Tabla inesperada: ${table}`);
    },
  };

  return { client, insertedReactions, insertedComments, deletedReactionFilters };
}

const passTarget: TargetRow = {
  id: "target-pass",
  kind: "pass",
  source_id: "pass-1",
  owner_id: "owner",
  commentable: true,
  reactable: true,
  comment_notification_type: "activity_commented",
  reaction_notification_type: "activity_liked",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifyMentions.mockResolvedValue([]);
});

describe("toggleReaction", () => {
  it("muta un pass por ID canónico y usa activity_liked", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await toggleReaction("target-pass");

    expect(fake.insertedReactions).toEqual([
      {
        interaction_target_id: "target-pass",
        user_id: "actor",
        kind: "❤️",
      },
    ]);
    expect(mocks.notify).toHaveBeenCalledWith(fake.client, {
      userId: "owner",
      actorId: "actor",
      type: "activity_liked",
      interactionTargetId: "target-pass",
      // Idempotencia de reacciones (spec item 9): un relike no reavisa.
      dedupeKey: "reaction:target-pass:actor",
      context: { emoji: "❤️" },
    });
  });

  it("la notificación de reacción lleva el emoji que se puso", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await toggleReaction("target-pass", "🔥");

    expect(mocks.notify).toHaveBeenCalledWith(
      fake.client,
      expect.objectContaining({ context: { emoji: "🔥" } }),
    );
  });

  it("no notifica una autoacción", async () => {
    const fake = makeActionClient({
      target: { ...passTarget, owner_id: "actor" },
    });
    mocks.createClient.mockResolvedValue(fake.client);

    await toggleReaction("target-pass");

    expect(fake.insertedReactions).toHaveLength(1);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("falla con el error estable si el target no es visible", async () => {
    const fake = makeActionClient({ target: null });
    mocks.createClient.mockResolvedValue(fake.client);

    await expect(toggleReaction("hidden-target")).rejects.toThrow(
      "interaction_target_not_found",
    );
  });

  it("inserta y borra por kind sin tocar otros kinds", async () => {
    // Fake con estado real de la tabla reactions (a diferencia de
    // makeActionClient, que no rastrea filtros entre llamadas): dos toggles
    // consecutivos necesitan ver el resultado del primero.
    let rows: Array<{ interaction_target_id: string; user_id: string; kind: string }> = [
      { interaction_target_id: "target-pass", user_id: "actor", kind: "❤️" },
    ];
    function reactionsTable() {
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        async maybeSingle() {
          const match = rows.find((r) =>
            filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v),
          );
          return { data: match ? { id: "reaction-id" } : null, error: null };
        },
        delete() {
          return {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return this;
            },
            then(resolve: (v: unknown) => void) {
              rows = rows.filter(
                (r) => !filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v),
              );
              resolve({ error: null });
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          rows.push(payload as { interaction_target_id: string; user_id: string; kind: string });
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    }
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) },
      from(table: string) {
        if (table === "interaction_targets") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async maybeSingle() {
              return { data: passTarget, error: null };
            },
          };
        }
        if (table === "reactions") return reactionsTable();
        throw new Error(`Tabla inesperada: ${table}`);
      },
    };
    mocks.createClient.mockResolvedValue(client);

    await toggleReaction("target-pass", "🔥");
    expect(rows).toContainEqual({
      interaction_target_id: "target-pass",
      user_id: "actor",
      kind: "🔥",
    });
    expect(rows).toContainEqual({
      interaction_target_id: "target-pass",
      user_id: "actor",
      kind: "❤️",
    });

    await toggleReaction("target-pass", "🔥");
    expect(rows).not.toContainEqual(
      expect.objectContaining({ kind: "🔥" }),
    );
    expect(rows).toContainEqual({
      interaction_target_id: "target-pass",
      user_id: "actor",
      kind: "❤️",
    });
  });

  it("rechaza cualquier cosa que no esté en el catálogo, sin tocar la base", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await expect(toggleReaction("target-pass", "like")).rejects.toThrow(
      "reaction_emoji_not_allowed",
    );
    await expect(toggleReaction("target-pass", "<script>")).rejects.toThrow(
      "reaction_emoji_not_allowed",
    );
    await expect(toggleReaction("target-pass", "🔥🔥")).rejects.toThrow(
      "reaction_emoji_not_allowed",
    );
    expect(fake.insertedReactions).toHaveLength(0);
  });

  it("acepta un emoji cualquiera del catálogo, no solo la fila rápida", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await toggleReaction("target-pass", "🐙");

    expect(fake.insertedReactions).toEqual([
      { interaction_target_id: "target-pass", user_id: "actor", kind: "🐙" },
    ]);
  });
});

describe("addComment", () => {
  const checkpointTarget: TargetRow = {
    id: "target-checkpoint",
    kind: "activity_checkpoint",
    source_id: "checkpoint-1",
    owner_id: "owner",
    commentable: true,
    reactable: false,
    comment_notification_type: "checkpoint_commented",
    reaction_notification_type: null,
  };
  const commentTarget: TargetRow = {
    id: "target-comment",
    kind: "comment",
    source_id: "comment-1",
    owner_id: "actor",
    commentable: false,
    reactable: true,
    comment_notification_type: null,
    reaction_notification_type: "comment_liked",
  };

  it("comenta un checkpoint por ID canónico y usa checkpoint_commented", async () => {
    const fake = makeActionClient({ target: checkpointTarget, commentTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await addComment("target-checkpoint", "  Llegué  ");

    expect(fake.insertedComments).toEqual([
      {
        interaction_target_id: "target-checkpoint",
        author_id: "actor",
        body: "Llegué",
        parent_id: null,
        is_spoiler: false,
      },
    ]);
    expect(mocks.notifyMentions).toHaveBeenCalledWith(fake.client, {
      authorId: "actor",
      text: "Llegué",
      interactionTargetId: "target-comment",
    });
    expect(mocks.notify).toHaveBeenCalledWith(fake.client, {
      userId: "owner",
      actorId: "actor",
      type: "checkpoint_commented",
      interactionTargetId: "target-checkpoint",
      context: { excerpt: "Llegué" },
    });
  });

  it("la notificación de comentario lleva un extracto", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await addComment("target-pass", "Lo terminé anoche y me dejó tocado");

    expect(mocks.notify).toHaveBeenCalledWith(
      fake.client,
      expect.objectContaining({
        context: { excerpt: "Lo terminé anoche y me dejó tocado" },
      }),
    );
  });

  it("la de un comentario spoiler avisa sin citar", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await addComment("target-pass", "Muere el protagonista", { isSpoiler: true });

    expect(mocks.notify).toHaveBeenCalledWith(
      fake.client,
      expect.objectContaining({ context: { spoiler: true } }),
    );
  });

  it("no duplica el aviso normal si una mención ya avisó al owner", async () => {
    const fake = makeActionClient({ target: passTarget, commentTarget });
    mocks.createClient.mockResolvedValue(fake.client);
    mocks.notifyMentions.mockResolvedValue(["owner"]);

    await addComment("target-pass", "@owner gran reseña");

    expect(fake.insertedComments).toHaveLength(1);
    expect(mocks.notifyMentions).toHaveBeenCalledOnce();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("mantiene el aviso normal al owner si la mención no llegó a insertarse", async () => {
    const fake = makeActionClient({ target: passTarget, commentTarget });
    mocks.createClient.mockResolvedValue(fake.client);
    mocks.notifyMentions.mockResolvedValue([]);

    await addComment("target-pass", "@owner gran reseña");

    expect(mocks.notify).toHaveBeenCalledWith(fake.client, {
      userId: "owner",
      actorId: "actor",
      type: "activity_commented",
      interactionTargetId: "target-pass",
      context: { excerpt: "@owner gran reseña" },
    });
  });
});

// Doble encadenable para `.from("comments").delete().eq(...).select(...)`:
// `.select` con RETURNING es lo que distingue 0 filas (RLS bloqueó) de éxito,
// así que el doble tiene que soportar la cadena completa, no solo `.eq`.
function commentDeleteBuilder(data: Array<{ id: string; audio_path: string | null }> | null) {
  const eqCalls: Array<[string, string]> = [];
  const builder = {
    eq(column: string, value: string) {
      eqCalls.push([column, value]);
      return builder;
    },
    select(_columns: string) {
      return builder;
    },
    then(resolve: (value: unknown) => void) {
      resolve({ data, error: null });
    },
  };
  return { builder, eqCalls };
}

function makeDeleteCommentClient(
  data: Array<{ id: string; audio_path: string | null }> | null,
  userId = "actor",
) {
  const { builder, eqCalls } = commentDeleteBuilder(data);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from: () => ({ delete: () => builder }),
  };
  return { client, eqCalls };
}

describe("deleteComment", () => {
  it("delega la autorización completa a RLS sin limitar el borrado al autor", async () => {
    const { client, eqCalls } = makeDeleteCommentClient(
      [{ id: "comment-1", audio_path: null }],
      "moderator",
    );
    mocks.createClient.mockResolvedValue(client);

    await deleteComment("comment-1");

    expect(eqCalls).toEqual([["id", "comment-1"]]);
    expect(mocks.revalidateInteraction).toHaveBeenCalledOnce();
  });

  it("al borrar un comentario con audio, borra también el objeto de Storage", async () => {
    const { client } = makeDeleteCommentClient([{ id: "c1", audio_path: "u1/a.webm" }]);
    mocks.createClient.mockResolvedValue(client);

    const res = await deleteComment("c1");

    expect(res).toEqual({ ok: true });
    expect(mocks.deleteVoiceNote).toHaveBeenCalledWith("u1/a.webm");
  });

  it("comentario de texto: no toca Storage", async () => {
    const { client } = makeDeleteCommentClient([{ id: "c1", audio_path: null }]);
    mocks.createClient.mockResolvedValue(client);

    await deleteComment("c1");

    expect(mocks.deleteVoiceNote).not.toHaveBeenCalled();
  });

  it("RLS bloquea (0 filas) → not_allowed_or_missing, no ok silencioso", async () => {
    const { client } = makeDeleteCommentClient([]);
    mocks.createClient.mockResolvedValue(client);

    expect(await deleteComment("c1")).toEqual({ ok: false, error: "not_allowed_or_missing" });
    expect(mocks.revalidateInteraction).not.toHaveBeenCalled();
  });
});
