import { describe, expect, it, vi } from "vitest";

// feed.ts arrastra `server-only` (vía get-interaction-summary), que lanza en node.
vi.mock("server-only", () => ({}));

import { buildMilestoneContext, MILESTONE_FRIENDS_SHOWN } from "./feed";

const VIEWER = "viewer";
const ACTOR = "actor";
const milestone = { actorId: ACTOR, itemType: "series", itemId: "loki" };

function pass(over: Partial<Parameters<typeof buildMilestoneContext>[0]["ownPasses"][number]> = {}) {
  return {
    itemType: "series",
    itemId: "loki",
    status: "completed" as const,
    rating: 8,
    isActive: false,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("buildMilestoneContext", () => {
  it("sin pase de quien mira ni seguidos: todo vacío", () => {
    const [c] = buildMilestoneContext({ viewerId: VIEWER, milestones: [milestone], ownPasses: [], friendPasses: [] });
    expect(c).toEqual({ viewerPass: null, friendIds: [], friendsTotal: 0, friendsStatus: "mixed" });
  });

  it("el pase activo manda sobre uno cerrado más reciente", () => {
    const [c] = buildMilestoneContext({
      viewerId: VIEWER,
      milestones: [milestone],
      ownPasses: [
        pass({ status: "completed", rating: 9, createdAt: "2026-05-01T00:00:00Z" }),
        pass({ status: "in_progress", rating: null, isActive: true, createdAt: "2026-02-01T00:00:00Z" }),
      ],
      friendPasses: [],
    });
    expect(c.viewerPass).toEqual({ status: "in_progress", rating: null });
  });

  it("sin activo, el más reciente; y solo el de ESA obra", () => {
    const [c] = buildMilestoneContext({
      viewerId: VIEWER,
      milestones: [milestone],
      ownPasses: [
        pass({ status: "dropped", rating: null, createdAt: "2026-01-01T00:00:00Z" }),
        pass({ status: "completed", rating: 7, createdAt: "2026-03-01T00:00:00Z" }),
        pass({ itemId: "otra", status: "planned", rating: null, createdAt: "2026-09-01T00:00:00Z" }),
        // Mismo id, otro tipo: no es la misma obra.
        pass({ itemType: "book", status: "planned", rating: null, createdAt: "2026-09-01T00:00:00Z" }),
      ],
      friendPasses: [],
    });
    expect(c.viewerPass).toEqual({ status: "completed", rating: 7 });
  });

  it("el hito propio no cuenta el pase de quien mira", () => {
    const [c] = buildMilestoneContext({
      viewerId: VIEWER,
      milestones: [{ ...milestone, actorId: VIEWER }],
      ownPasses: [pass()],
      friendPasses: [],
    });
    expect(c.viewerPass).toBeNull();
  });

  it("seguidos: sin el autor ni quien mira, en curso primero, y el estado agregado", () => {
    const [c] = buildMilestoneContext({
      viewerId: VIEWER,
      milestones: [milestone],
      ownPasses: [],
      friendPasses: [
        { userId: "ana", itemType: "series", itemId: "loki", status: "completed" },
        { userId: "flufli", itemType: "series", itemId: "loki", status: "in_progress" },
        { userId: ACTOR, itemType: "series", itemId: "loki", status: "in_progress" },
        { userId: VIEWER, itemType: "series", itemId: "loki", status: "in_progress" },
        { userId: "pepe", itemType: "series", itemId: "otra", status: "in_progress" },
      ],
    });
    expect(c.friendIds).toEqual(["flufli", "ana"]);
    expect(c.friendsTotal).toBe(2);
    expect(c.friendsStatus).toBe("mixed");
  });

  it("releer: un pase en curso manda sobre uno terminado de la misma persona", () => {
    const [c] = buildMilestoneContext({
      viewerId: VIEWER,
      milestones: [milestone],
      ownPasses: [],
      friendPasses: [
        { userId: "ana", itemType: "series", itemId: "loki", status: "in_progress" },
        { userId: "ana", itemType: "series", itemId: "loki", status: "completed" },
      ],
    });
    expect(c.friendIds).toEqual(["ana"]);
    expect(c.friendsStatus).toBe("in_progress");
  });

  it("enseña como mucho MILESTONE_FRIENDS_SHOWN y cuenta el resto", () => {
    const friendPasses = ["a", "b", "c", "d", "e"].map((userId) => ({
      userId,
      itemType: "series",
      itemId: "loki",
      status: "completed" as const,
    }));
    const [c] = buildMilestoneContext({ viewerId: VIEWER, milestones: [milestone], ownPasses: [], friendPasses });
    expect(c.friendIds).toHaveLength(MILESTONE_FRIENDS_SHOWN);
    expect(c.friendsTotal).toBe(5);
    expect(c.friendsStatus).toBe("completed");
  });
});
