import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
  getFeed: vi.fn(),
  getTranslations: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/social/feed", () => ({
  getFeed: mocks.getFeed,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: mocks.getTranslations,
}));

import { ActivityTab } from "@/app/u/[username]/_tabs/activity-tab";
import { loadMoreProfileFeed } from "./feed-actions";

const EMPTY_PAGE = {
  events: [],
  nextCursor: null,
  knownUsernames: [],
};

describe("visitante anónimo del feed de perfil", () => {
  const getUser = vi.fn();
  const supabase = { auth: { getUser } };

  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: null } });
    mocks.createClient.mockResolvedValue(supabase);
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getFeed.mockResolvedValue(EMPTY_PAGE);
  });

  it("ActivityTab no atribuye al actor la identidad del visitante anónimo", async () => {
    await ActivityTab({
      userId: "actor-id",
      viewerLoggedIn: false,
      isOwner: false,
    });

    expect(mocks.getFeed).toHaveBeenCalledWith(supabase, null, {
      actorId: "actor-id",
    });
  });

  it("la paginación del perfil mantiene null como visitante anónimo", async () => {
    const page = {
      events: [],
      nextCursor: "next-cursor",
      knownUsernames: ["ana"],
    };
    mocks.getFeed.mockResolvedValue(page);

    await expect(loadMoreProfileFeed("actor-id", "current-cursor")).resolves.toBe(page);
    expect(mocks.getFeed).toHaveBeenCalledWith(supabase, null, {
      cursor: "current-cursor",
      actorId: "actor-id",
    });
  });
});
