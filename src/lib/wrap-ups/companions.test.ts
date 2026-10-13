import { describe, expect, it } from "vitest";
import { companionIdsOf, resolveCompanionsWith } from "./companions";
import type { WrapUpPayload } from "./types";

const payload = (stories: unknown[]) => ({ stories } as unknown as WrapUpPayload);

describe("companionIdsOf", () => {
  it("ids únicos de los visionados de todas las crónicas", () => {
    const p = payload([{ id: "together", jointViewings: 2, clubDays: 0, viewings: [
      { item: {}, watchedOn: "x", companionIds: ["a", "b"] }, { item: {}, watchedOn: "y", companionIds: ["b"] },
    ] }]);
    expect(companionIdsOf([p, payload([{ id: "cover" }])])).toEqual(["a", "b"]);
  });
});

describe("resolveCompanionsWith", () => {
  it("descarta los bloqueados y mapea identidad", async () => {
    const supabase = {
      rpc: () => Promise.resolve({ data: ["a"], error: null }),
      from: () => ({ select: () => ({ in: () => Promise.resolve({
        data: [{ user_id: "a", username: "ana", display_name: "Ana", avatar_url: null }], error: null }) }) }),
    };
    expect(await resolveCompanionsWith(supabase as never, ["a", "b"])).toEqual({
      a: { userId: "a", username: "ana", displayName: "Ana", avatarUrl: null },
    });
  });
  it("sin ids no consulta", async () => {
    expect(await resolveCompanionsWith({} as never, [])).toEqual({});
  });
});
