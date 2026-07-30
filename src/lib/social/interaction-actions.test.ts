import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidateInteraction: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateInteraction: mocks.revalidateInteraction,
}));
vi.mock("./notifications", () => ({ notify: vi.fn() }));
vi.mock("./notify-mentions", () => ({ notifyMentions: vi.fn() }));

import { deleteComment } from "./interaction-actions";

beforeEach(() => vi.clearAllMocks());

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
