import { describe, expect, it, vi } from "vitest";
import { TrainingSession } from "./training-session";
import type { TrainingBattle, TrainingResponse } from "@/lib/pet/training/types";

const battle: TrainingBattle = { intentId: "one", status: "open", seed: "00000001000000020000000300000004", rulesetVersion: "r2.2", enemyId: "brote", contentHash: "hash", inputs: [], result: null, digest: null, snapshot: { name: "Roble", petClass: "wizard", stage: "acorn", attributes: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 }, tier: 0, hpMax: 100, atk: 10 } };
function setup() {
  const actions = { start: vi.fn(async (id: string): Promise<TrainingResponse> => ({ ok: true, battle: { ...battle, intentId: id } })), resolve: vi.fn(async (): Promise<TrainingResponse> => ({ ok: false, code: "NETWORK" })), replay: vi.fn(async (): Promise<TrainingResponse> => ({ ok: true, battle: { ...battle, status: "resolved" }, events: [] })) };
  let id = 0;
  return { actions, session: new TrainingSession(actions, () => String(++id)) };
}
describe("training session", () => {
  const winner: TrainingBattle = { ...battle, status: "resolved", result: { outcome: "win", reason: "ko", ticks: 123, petHp: 72, petHpMax: 100, enemyHp: 0, enemyHpMax: 420, damageDealt: 420, damageTaken: 28, causes: ["charges_interrupted"] } };
  const winnerEvents = [{ type: "BATTLE_ENDED" as const, seq: 0, tick: 123, outcome: "win" as const, reason: "ko" as const, petHp: 72, enemyHp: 0 }];
  it("replaces local HP and tick with the concurrent authoritative winner", async () => {
    const { session, actions } = setup(); await session.start();
    while (session.phase === "playing") session.tick();
    expect(session.view?.petHp).toBe(0);
    actions.resolve.mockResolvedValueOnce({ ok: true, battle: winner, events: winnerEvents });
    await session.resolve();
    expect(session.view).toMatchObject({ petHp: 72, petHpMax: 100, enemyHp: 0, enemyHpMax: 420, tick: 123, ended: true });
    expect(session.events).toEqual(winnerEvents);
  });
  it("restores the authoritative final view and events when start finds a resolved intent", async () => {
    const { session, actions } = setup();
    actions.start.mockResolvedValueOnce({ ok: true, battle: winner, events: winnerEvents });
    await session.start();
    expect(session.phase).toBe("done");
    expect(session.view).toMatchObject({ petHp: 72, enemyHp: 0, tick: 123, ended: true });
    expect(session.events).toEqual(winnerEvents);
    session.tick(); expect(session.view?.tick).toBe(123);
  });
  it("queues one current-tick skill without advancing and enforces cooldown", async () => { const { session } = setup(); await session.start(); expect(session.skill()).toBe(true); expect(session.skill()).toBe(false); expect(session.view?.tick).toBe(0); session.tick(); expect(session.inputs).toEqual([{ seq: 0, tick: 0, action: "skill", payload: {} }]); expect(session.skill()).toBe(false); });
  it("pause and hidden state stop time and input", async () => { const { session } = setup(); await session.start(); session.paused = true; session.tick(); expect(session.skill()).toBe(false); session.paused = false; session.hidden = true; session.tick(); expect(session.view?.tick).toBe(0); expect(session.skill()).toBe(false); session.hidden = false; session.tick(); expect(session.view?.tick).toBe(1); });
  it("retains intent on failed start and creates a new one only on repeat", async () => { const { session, actions } = setup(); actions.start.mockRejectedValueOnce(new Error()); await session.start(); await session.start(); expect(actions.start.mock.calls.map(c => c[0])).toEqual(["1", "1"]); session.phase = "done"; await session.start(true); expect(actions.start).toHaveBeenLastCalledWith("2"); });
  it("preserves identical log on failed resolution", async () => { const { session, actions } = setup(); await session.start(); session.skill(); while (session.phase === "playing") session.tick(); await session.resolve(); const first = structuredClone(actions.resolve.mock.calls); await session.resolve(); expect(actions.resolve.mock.calls[1]).toEqual(first[0]); expect(session.inputs).toHaveLength(1); });
  it("replay only consumes server events and never resolves", async () => { const { session, actions } = setup(); await session.start(); session.phase = "done"; await session.replay(); session.tick(); expect(actions.replay).toHaveBeenCalledOnce(); expect(actions.resolve).not.toHaveBeenCalled(); });
  it("rejects unsupported versions before simulating", async () => { const { session, actions } = setup(); actions.start.mockResolvedValueOnce({ ok: true, battle: { ...battle, rulesetVersion: "future" } }); await session.start(); expect(session.error).toBe("UNSUPPORTED_BATTLE"); expect(session.view).toBeNull(); });
});

