import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidateInteraction: vi.fn(),
  notify: vi.fn(),
  notifyMentions: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateInteraction: mocks.revalidateInteraction,
}));
vi.mock("./notifications", () => ({ notify: mocks.notify }));
vi.mock("./notify-mentions", () => ({ notifyMentions: mocks.notifyMentions }));

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
        target_type: "pass",
        target_id: "pass-1",
        user_id: "actor",
        kind: "like",
      },
    ]);
    expect(mocks.notify).toHaveBeenCalledWith(fake.client, {
      userId: "owner",
      actorId: "actor",
      type: "activity_liked",
      interactionTargetId: "target-pass",
    });
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
        target_type: "activity_checkpoint",
        target_id: "checkpoint-1",
        author_id: "actor",
        body: "Llegué",
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
    });
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
    });
  });
});

describe("deleteComment", () => {
  it("delega la autorización completa a RLS sin limitar el borrado al autor", async () => {
    const eqCalls: Array<[string, string]> = [];
    const builder = {
      eq(column: string, value: string) {
        eqCalls.push([column, value]);
        return builder;
      },
      then(resolve: (value: unknown) => void) {
        resolve({ error: null });
      },
    };
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "moderator" } } }) },
      from: () => ({ delete: () => builder }),
    });

    await deleteComment("comment-1");

    expect(eqCalls).toEqual([["id", "comment-1"]]);
    expect(mocks.revalidateInteraction).toHaveBeenCalledOnce();
  });
});
