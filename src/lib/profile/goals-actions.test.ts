import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  error: null as unknown,
  feed: vi.fn(), corner: vi.fn(), update: vi.fn(), eq: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/lib/storage/upload-public-image", () => ({ uploadPublicImage: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  from: () => ({ update: (data: unknown) => { mocks.update(data); return { eq: async (...args: unknown[]) => { mocks.eq(...args); return { error: mocks.error }; } }; } }),
}) }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateFeed: mocks.feed, revalidateLibraryCorner: mocks.corner,
  revalidateProfile: vi.fn(), revalidateLibrary: vi.fn(), revalidateProfilePages: vi.fn(), revalidateCollectionPages: vi.fn(),
}));
import { updateGoals } from "./actions";

beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: "owner" }; mocks.error = null; });
const form = (value: string) => { const data = new FormData(); data.set("dailyGoalMinutes", value); return data; };

describe("objetivo diario en Biblioteca", () => {
  it("guardar refresca el medidor del Rincón y mantiene la tira de Inicio", async () => {
    expect(await updateGoals({}, form("25"))).toEqual({});
    expect(mocks.update).toHaveBeenCalledWith({ daily_goal_minutes: 25 });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mocks.feed).toHaveBeenCalledOnce();
    expect(mocks.corner).toHaveBeenCalledOnce();
  });
  it("un fallo al guardar no invalida vistas ni simula éxito", async () => {
    mocks.error = new Error("write failed");
    expect(await updateGoals({}, form("25"))).toEqual({ error: "generic" });
    expect(mocks.feed).not.toHaveBeenCalled();
    expect(mocks.corner).not.toHaveBeenCalled();
  });
  it("el objetivo sigue ligado a sesión y rechaza valores inválidos", async () => {
    expect(await updateGoals({}, form("-1"))).toEqual({ error: "invalidGoal" });
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.user = null;
    await expect(updateGoals({}, form("25"))).rejects.toThrow("redirect");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
