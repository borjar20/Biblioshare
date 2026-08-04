import { describe, expect, it, vi } from "vitest";
import { getInteractionSummary } from "./interactions";

type Row = Record<string, unknown>;

type Query = {
  table: string;
  equals: Array<[string, unknown]>;
  includes: Array<[string, unknown[]]>;
};

function makeFakeSupabase(tables: Record<string, Row[]>) {
  const queries: Query[] = [];

  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "viewer" } } })) },
    from(table: string) {
      const query: Query = { table, equals: [], includes: [] };
      queries.push(query);

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          query.equals.push([column, value]);
          return builder;
        },
        in(column: string, values: unknown[]) {
          query.includes.push([column, values]);
          return builder;
        },
        order() {
          return builder;
        },
        then(resolve: (value: unknown) => void) {
          let data = tables[table] ?? [];
          for (const [column, value] of query.equals) {
            data = data.filter((row) => row[column] === value);
          }
          for (const [column, values] of query.includes) {
            data = data.filter((row) => values.includes(row[column]));
          }
          resolve({
            data,
            error: null,
            count: null,
            status: 200,
            statusText: "OK",
          });
        },
      };
      return builder;
    },
    rpc: vi.fn(async (name: string) => {
      expect(name).toBe("moderatable_target_ids");
      return {
        data: ["entry-owned"],
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { client, queries };
}

describe("getInteractionSummary", () => {
  it("expone el target canónico del source y el target propio de cada comentario", async () => {
    const { client, queries } = makeFakeSupabase({
      interaction_targets: [
        { id: "target-parent-other", kind: "diary_entry", source_id: "entry-other" },
        { id: "target-comment-owned", kind: "comment", source_id: "comment-owned" },
        { id: "target-parent-owned", kind: "diary_entry", source_id: "entry-owned" },
        { id: "target-comment-other", kind: "comment", source_id: "comment-other" },
      ],
      reactions: [
        { interaction_target_id: "target-parent-owned", user_id: "viewer" },
        { interaction_target_id: "target-comment-owned", user_id: "viewer" },
      ],
      comments: [
        {
          id: "comment-owned",
          interaction_target_id: "target-parent-owned",
          author_id: "author-1",
          body: "moderable",
          created_at: "2026-07-30T00:00:00Z",
        },
        {
          id: "comment-other",
          interaction_target_id: "target-parent-other",
          author_id: "author-2",
          body: "ajeno",
          created_at: "2026-07-30T00:01:00Z",
        },
      ],
      profile_identities: [
        {
          user_id: "author-1",
          username: "ana",
          display_name: "Ana",
          avatar_url: "https://example.com/ana.jpg",
        },
        {
          user_id: "author-2",
          username: "bea",
          display_name: null,
          avatar_url: null,
        },
      ],
    });

    const summaries = await getInteractionSummary(client, "diary_entry", [
      "entry-owned",
      "entry-other",
    ]);

    expect(summaries.get("entry-owned")).toMatchObject({
      interactionTargetId: "target-parent-owned",
      reactionCount: 1,
      viewerReacted: true,
      commentCount: 1,
    });
    expect(summaries.get("entry-owned")?.comments[0]).toMatchObject({
      id: "comment-owned",
      interactionTargetId: "target-comment-owned",
      author: "Ana",
      authorUsername: "ana",
      authorAvatarUrl: "https://example.com/ana.jpg",
      isOwn: false,
      canDelete: true,
      reactionCount: 1,
      viewerReacted: true,
    });
    expect(summaries.get("entry-other")?.comments[0]).toMatchObject({
      id: "comment-other",
      interactionTargetId: "target-comment-other",
      author: "bea",
      authorUsername: "bea",
      authorAvatarUrl: null,
      canDelete: false,
    });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(
      queries.filter((query) => query.table === "reactions").map((query) => query.includes),
    ).toEqual([
      [["interaction_target_id", ["target-parent-owned", "target-parent-other"]]],
      [["interaction_target_id", ["target-comment-owned", "target-comment-other"]]],
    ]);
  });

  it("lanza un error de integridad si falta el target de un source visible", async () => {
    const { client } = makeFakeSupabase({
      interaction_targets: [
        { id: "target-present", kind: "diary_entry", source_id: "entry-present" },
      ],
    });

    await expect(
      getInteractionSummary(client, "diary_entry", ["entry-present", "missing"]),
    ).rejects.toThrow(/interaction target.*diary_entry:missing/i);
  });

  // #340: un comentario cuyo target canónico no resuelve es un hecho de
  // visibilidad, no corrupción. Antes tumbaba el lote entero (una página de
  // club en 500 permanente por un solo comentario).
  it("descarta el comentario sin target canónico sin tumbar el lote", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeFakeSupabase({
      interaction_targets: [
        { id: "target-parent", kind: "diary_entry", source_id: "entry" },
        { id: "target-comment-ok", kind: "comment", source_id: "comment-ok" },
        // comment-invisible no tiene fila: el espectador no la ve.
      ],
      reactions: [{ interaction_target_id: "target-comment-ok", user_id: "viewer" }],
      comments: [
        {
          id: "comment-ok",
          interaction_target_id: "target-parent",
          author_id: "author-1",
          body: "visible",
          created_at: "2026-07-30T00:00:00Z",
        },
        {
          id: "comment-invisible",
          interaction_target_id: "target-parent",
          author_id: "author-2",
          body: "no resoluble",
          created_at: "2026-07-30T00:01:00Z",
        },
      ],
      profile_identities: [
        { user_id: "author-1", username: "ana", display_name: "Ana", avatar_url: null },
        { user_id: "author-2", username: "bea", display_name: null, avatar_url: null },
      ],
    });

    const summaries = await getInteractionSummary(client, "diary_entry", ["entry"]);

    const summary = summaries.get("entry");
    expect(summary).toMatchObject({ interactionTargetId: "target-parent", commentCount: 1 });
    expect(summary?.comments.map((c) => c.id)).toEqual(["comment-ok"]);
    // La degradación deja rastro, no es silenciosa.
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("comment-invisible"));
    // El comentario superviviente conserva sus reacciones.
    expect(summary?.comments[0]).toMatchObject({ reactionCount: 1, viewerReacted: true });
    errorSpy.mockRestore();
  });
});
