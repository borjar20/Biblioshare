import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/onboarding/get-social-suggestions", () => ({
  getSocialSuggestions: vi.fn(async () => ({
    profiles: [
      { userId: "visible", username: "visible", displayName: null, avatarUrl: null },
      { userId: "blocked", username: "blocked", displayName: null, avatarUrl: null },
      { userId: "following", username: "following", displayName: null, avatarUrl: null },
    ],
    clubs: [],
  })),
}));

import { getWhoToFollow } from "./get-who-to-follow";

describe("getWhoToFollow", () => {
  it("excluye seguidos y usuarios bloqueados en cualquiera de las dos direcciones", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ followee_id: "following" }], error: null }),
        }),
      }),
      rpc: vi.fn(async () => ({ data: ["visible"], error: null })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await getWhoToFollow(supabase, "viewer");

    expect(result.map((person) => person.userId)).toEqual(["visible"]);
    expect(supabase.rpc).toHaveBeenCalledWith("filter_unblocked_user_ids", {
      candidate_ids: ["visible", "blocked"],
    });
  });
});
