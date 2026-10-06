import { beforeEach, describe, expect, it, vi } from "vitest";

// Defensa en profundidad: además de RLS, la consulta filtra por el usuario de la sesión.
const calls: [string, unknown][] = [];
const user = { id: "u1" } as { id: string } | null;
const m = { user };
const builder = {
  select: vi.fn(() => builder),
  eq: vi.fn((col: string, val: unknown) => { calls.push([col, val]); return builder; }),
  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  then: (res: (v: unknown) => void) => res({ data: [], error: null }),
};
const from = vi.fn(() => builder);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
  getCurrentUser: async () => m.user,
}));

beforeEach(() => { calls.length = 0; from.mockClear(); m.user = { id: "u1" }; });

describe("getOwnWrapUps / getOwnWrapUp", () => {
  it("filtran por user_id además de RLS", async () => {
    const { getOwnWrapUp, getOwnWrapUps } = await import("./get-own-wrap-ups");
    await getOwnWrapUps();
    expect(calls).toContainEqual(["user_id", "u1"]);
    calls.length = 0;
    await getOwnWrapUp("week");
    expect(calls).toContainEqual(["user_id", "u1"]);
    expect(calls).toContainEqual(["kind", "week"]);
  });
  it("sin sesión no consultan", async () => {
    m.user = null;
    const { getOwnWrapUp, getOwnWrapUps } = await import("./get-own-wrap-ups");
    expect(await getOwnWrapUps()).toEqual([]);
    expect(await getOwnWrapUp("week")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
