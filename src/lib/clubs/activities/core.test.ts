import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getInteractionSummary: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/social/interactions", () => ({
  getInteractionSummary: mocks.getInteractionSummary,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getActivity } from "./core";

function activityClient() {
  const activity = {
    id: "activity-1",
    club_id: "club-1",
    kind: "tierlist",
    title: "Tierlist",
    description: null,
    status: "active",
    config: null,
    created_by: "owner",
    starts_on: null,
    ends_on: null,
    created_at: "2026-08-01T00:00:00Z",
    spawned_from_activity_id: null,
    spawned_from_item_type: null,
    spawned_from_item_id: null,
  };

  return {
    auth: { getUser: async () => ({ data: { user: { id: "viewer" } } }) },
    from(table: string) {
      let selection = "";
      const builder = {
        select(value: string) {
          selection = value;
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        order() {
          return Promise.resolve({ data: [] });
        },
        async maybeSingle() {
          if (table === "club_activities") return { data: activity, error: null };
          return { data: null, error: null };
        },
        then(resolve: (value: unknown) => void) {
          if (table === "club_activity_participants") {
            resolve({ data: [{ user_id: "other-member" }] });
            return;
          }
          if (table === "profile_identities" && selection.includes("username")) {
            resolve({
              data: [
                {
                  user_id: "other-member",
                  username: "other",
                  display_name: "Other",
                  avatar_url: null,
                },
              ],
            });
            return;
          }
          resolve({ data: [] });
        },
      };
      return builder;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue(activityClient());
  mocks.getInteractionSummary.mockRejectedValue(new Error("chat hidden by RLS"));
});

describe("getActivity", () => {
  it("sirve el detalle sin chat a un miembro que no participa", async () => {
    const activity = await getActivity("activity-1");

    expect(activity).toMatchObject({
      id: "activity-1",
      viewerIsParticipant: false,
      chat: null,
    });
    expect(mocks.getInteractionSummary).not.toHaveBeenCalled();
  });
});
