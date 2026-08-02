import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  notifyMany: vi.fn(),
  notifyMentions: vi.fn(),
  revalidateClubPages: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/social/notifications", () => ({ notifyMany: mocks.notifyMany }));
vi.mock("@/lib/social/notify-mentions", () => ({ notifyMentions: mocks.notifyMentions }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateClubPages: mocks.revalidateClubPages,
}));

import { createShareActivityPost, createTextPost } from "./posts";

function makePostsClient(targetId: string | null) {
  const targetFilters: Array<[string, unknown]> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "author" } } }) },
    from(table: string) {
      if (table === "club_posts") {
        return {
          insert() {
            const result = {
              select() {
                return result;
              },
              async single() {
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
          eq(column: string, value: unknown) {
            targetFilters.push([column, value]);
            return builder;
          },
          async maybeSingle() {
            return { data: targetId ? { id: targetId } : null, error: null };
          },
        };
        return builder;
      }
      if (table === "club_members") {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          neq() {
            return builder;
          },
          then(resolve: (value: unknown) => void) {
            resolve({ data: [], error: null });
          },
        };
        return builder;
      }
      throw new Error(`Tabla inesperada: ${table}`);
    },
  };
  return { client, targetFilters };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifyMentions.mockResolvedValue([]);
  mocks.notifyMany.mockResolvedValue(undefined);
});

describe("menciones de posts", () => {
  it.each([
    ["texto", () => createTextPost("club-1", "hola @ana")],
    [
      "actividad compartida",
      () =>
        createShareActivityPost("club-1", "hola @ana", {
          sourceTable: "diary_entries",
          rowId: "00000000-0000-4000-8000-000000000001",
        }),
    ],
  ])("resuelve club_post:<post.id> para el post de %s", async (_label, run) => {
    const fake = makePostsClient("target-post");
    mocks.createClient.mockResolvedValue(fake.client);

    await run();

    expect(fake.targetFilters).toEqual([
      ["kind", "club_post"],
      ["source_id", "post-1"],
    ]);
    expect(mocks.notifyMentions).toHaveBeenCalledWith(fake.client, {
      authorId: "author",
      text: "hola @ana",
      interactionTargetId: "target-post",
    });
    expect(mocks.revalidateClubPages).toHaveBeenCalledOnce();
  });

  it("conserva fan-out y revalidación si falta el target ya persistido", async () => {
    const fake = makePostsClient(null);
    mocks.createClient.mockResolvedValue(fake.client);

    await createTextPost("club-1", "hola @ana");

    expect(mocks.notifyMentions).not.toHaveBeenCalled();
    expect(mocks.notifyMany).toHaveBeenCalledOnce();
    expect(mocks.revalidateClubPages).toHaveBeenCalledOnce();
  });
});
