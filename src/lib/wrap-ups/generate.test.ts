import { describe, expect, it, vi } from "vitest";
import { sweepWrapUps, type SweepDeps } from "./generate";
import type { WrapUpPayload } from "./types";

const NOW = new Date("2026-10-05T07:00:00Z");
const payload = (intensity: "full" | "quiet") =>
  ({ v: 1, kind: "week", periodStart: "2026-09-28", intensity }) as unknown as WrapUpPayload;

function deps(over: Partial<SweepDeps>): SweepDeps {
  return {
    candidates: async () => ["u1"],
    build: async () => payload("full"),
    current: async () => null,
    upsert: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    push: vi.fn(async () => {}),
    ...over,
  };
}

describe("sweepWrapUps", () => {
  it("escribe y avisa un periodo nuevo full", async () => {
    const d = deps({});
    expect(await sweepWrapUps("week", NOW, d)).toEqual({ candidates: 1, written: 1, deleted: 0, pushed: 1, failed: 0 });
    expect(d.upsert).toHaveBeenCalledWith("u1", expect.anything(), false);
  });
  it("reintento del mismo periodo: reescribe sin repetir push", async () => {
    const d = deps({ current: async () => ({ period_start: "2026-09-28" }) });
    const r = await sweepWrapUps("week", NOW, d);
    expect(r.pushed).toBe(0);
    expect(d.push).not.toHaveBeenCalled();
    expect(d.upsert).toHaveBeenCalledWith("u1", expect.anything(), true);
  });
  it("quiet no avisa", async () => {
    expect((await sweepWrapUps("week", NOW, deps({ build: async () => payload("quiet") }))).pushed).toBe(0);
  });
  it("sin actividad borra la fila", async () => {
    const d = deps({ build: async () => null });
    expect((await sweepWrapUps("week", NOW, d)).deleted).toBe(1);
    expect(d.remove).toHaveBeenCalledWith("u1", "week");
  });
  it("un fallo no tumba el barrido", async () => {
    const d = deps({
      candidates: async () => ["u1", "u2"],
      build: async (u) => { if (u === "u1") throw new Error("x"); return payload("full"); },
    });
    expect(await sweepWrapUps("week", NOW, d)).toMatchObject({ candidates: 2, written: 1, failed: 1 });
  });
});
