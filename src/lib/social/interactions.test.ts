import { describe, expect, it, vi } from "vitest";
import { getInteractionSummary } from "./interactions";

type Row = Record<string, unknown>;

function makeFakeSupabase(tables: Record<string, Row[]>) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "viewer" } } })) },
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        order() {
          return builder;
        },
        then(resolve: (value: unknown) => void) {
          resolve({ data: tables[table] ?? [], error: null });
        },
      };
      return builder;
    },
    rpc: vi.fn(async (name: string) => {
      expect(name).toBe("moderatable_target_ids");
      return { data: ["target-owned"], error: null };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("getInteractionSummary — identidad y moderación", () => {
  it("resuelve identidad completa y canDelete en lote para dueño/moderador", async () => {
    const supabase = makeFakeSupabase({
      reactions: [],
      comments: [
        {
          id: "comment-owned",
          target_id: "target-owned",
          author_id: "author-1",
          body: "moderable",
          created_at: "2026-07-30T00:00:00Z",
        },
        {
          id: "comment-other",
          target_id: "target-other",
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

    const summaries = await getInteractionSummary(supabase, "diary_entry", [
      "target-owned",
      "target-other",
    ]);

    expect(summaries.get("target-owned")?.comments[0]).toMatchObject({
      author: "Ana",
      authorUsername: "ana",
      authorAvatarUrl: "https://example.com/ana.jpg",
      isOwn: false,
      canDelete: true,
    });
    expect(summaries.get("target-other")?.comments[0]).toMatchObject({
      author: "bea",
      authorUsername: "bea",
      authorAvatarUrl: null,
      canDelete: false,
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});
