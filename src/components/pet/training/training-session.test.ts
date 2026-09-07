import { describe, expect, it, vi } from "vitest";
import { TrainingSession } from "./training-session";
import type { TrainingBattle, TrainingResponse } from "@/lib/pet/training/types";
import { ENEMIES, RULESET } from "@/lib/pet/battle/content";
import { pickEnemies, enemyList } from "@/lib/pet/battle/adventure";
import { POLICIES, runPolicy } from "@/lib/pet/battle/policies";
import { snapshotForProfile } from "@/lib/pet/battle/profiles";
import { seedFromIndex } from "@/lib/pet/battle/prng";
import { contentHash as r3Hash } from "@/lib/pet/battle/versions/r3.1/content";

const battle: TrainingBattle = { intentId: "one", status: "open", seed: "00000001000000020000000300000004", rulesetVersion: "r2.2", enemyId: "brote", contentHash: "hash", inputs: [], result: null, digest: null, snapshot: { name: "Roble", petClass: "wizard", stage: "acorn", attributes: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 }, tier: 0, hpMax: 100, atk: 10 } };
function setup() {
  const actions = { start: vi.fn(async (id: string): Promise<TrainingResponse> => ({ ok: true, battle: { ...battle, intentId: id } })), resolve: vi.fn(async (): Promise<TrainingResponse> => ({ ok: false, code: "NETWORK" })), replay: vi.fn(async (): Promise<TrainingResponse> => ({ ok: true, battle: { ...battle, status: "resolved" }, events: [] })) };
  let id = 0;
  return { actions, session: new TrainingSession(actions, () => String(++id)) };
}
describe("training session", () => {
  const winner: TrainingBattle = { ...battle, status: "resolved", result: { outcome: "win", reason: "ko", ticks: 123, petHp: 72, petHpMax: 100, enemyHp: 0, enemyHpMax: 420, damageDealt: 420, damageTaken: 28, causes: ["charges_interrupted"], fight: 1 } };
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
  it("retains intent on failed start and creates a new one only on repeat", async () => { const { session, actions } = setup(); actions.start.mockRejectedValueOnce(new Error()); await session.start(); await session.start(); expect(actions.start.mock.calls.map(c => c[0])).toEqual(["1", "1"]); session.phase = "done"; await session.start(true); expect(actions.start).toHaveBeenLastCalledWith("2", "brote"); });
  it("preserves identical log on failed resolution", async () => { const { session, actions } = setup(); await session.start(); session.skill(); while (session.phase === "playing") session.tick(); await session.resolve(); const first = structuredClone(actions.resolve.mock.calls); await session.resolve(); expect(actions.resolve.mock.calls[1]).toEqual(first[0]); expect(session.inputs).toHaveLength(1); });
  it("replay only consumes server events and never resolves", async () => { const { session, actions } = setup(); await session.start(); session.phase = "done"; await session.replay(); session.tick(); expect(actions.replay).toHaveBeenCalledOnce(); expect(actions.resolve).not.toHaveBeenCalled(); });
  it("rejects unsupported versions before simulating", async () => { const { session, actions } = setup(); actions.start.mockResolvedValueOnce({ ok: true, battle: { ...battle, rulesetVersion: "future" } }); await session.start(); expect(session.error).toBe("UNSUPPORTED_BATTLE"); expect(session.view).toBeNull(); });
});



describe("R3 ulti controller", () => {
 async function ready() {
  const {session,actions}=setup();
  actions.start.mockResolvedValueOnce({ok:true,battle:{...battle,intentId:"1",rulesetVersion:"r3.1"}});
  await session.start(); for(let i=0;i<120;i++) session.tick(); return {session,actions};
 }
 it("stops ticks and cooldown while open, keeps previous pause and cancel spends nothing",async()=>{
  const {session}=await ready(); session.paused=true; expect(session.openUlti()).toBe(true);
  const before=structuredClone(session.view); session.tick(); expect(session.view).toEqual(before); expect(session.skill()).toBe(false);
  session.cancelUlti(); expect(session.paused).toBe(true); expect(session.inputs).toEqual([]);
 });
 it("submits one atomic permutation, preserves payload on resolve and refuses a second use",async()=>{
  const {session,actions}=await ready(); session.openUlti(); expect(session.confirmUlti("0012")).toBe(false);
  expect(session.confirmUlti("0123")).toBe(true); expect(session.confirmUlti("0123")).toBe(false);
  session.tick(); expect(session.view?.ultiUsed).toBe(true); expect(session.openUlti()).toBe(false);
  while(session.phase==="playing") session.tick(); await session.resolve();
  expect(actions.resolve.mock.calls[0]).toEqual(["1",[{seq:0,tick:120,action:"ulti",payload:{order:"0123"}}]]);
 });
 it("retains selected enemy over network retries",async()=>{
  const {session,actions}=setup();session.enemyId="caparazon";actions.start.mockRejectedValueOnce(new Error());await session.start();session.enemyId="brote";await session.start();
  expect(actions.start.mock.calls.map(call=>call.slice(0,2))).toEqual([["1","caparazon"],["1","caparazon"]]);
 });
});

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m };
}
const snapshot = snapshotForProfile("lectora_larga", "wizard");

describe("chains and local log", () => {
  it("simula una fila r3.1 con el motor r3.1 (un tramo) y expone fight 1/1", async () => {
    const battle = { intentId: "i1", status: "open" as const, seed: seedFromIndex(1), snapshot, rulesetVersion: "r3.1", contentHash: await r3Hash(), enemyId: "caparazon", inputs: [], result: null, digest: null };
    const s = new TrainingSession({ start: async () => ({ ok: true, battle }), resolve: async () => ({ ok: false, code: "x" }), replay: async () => ({ ok: false, code: "x" }) }, () => "i1");
    await s.start();
    expect(s.phase).toBe("playing");
    expect(s.view).toMatchObject({ fight: 1, fights: 1, tick: 0 });
  });

  it("cadena r4.1: al acabar un tramo espera «Continuar», y el log local reanuda en pausa donde estaba", async () => {
    // seed que supera el primer tramo con la política interrupt
    let found: { seed: string; inputs: ReturnType<typeof runPolicy>["inputs"]; endedTick: number } | null = null;
    for (let i = 0; i < 100 && !found; i++) {
      const seed = seedFromIndex(i);
      const enemies = pickEnemies(seed, 3, ENEMIES);
      const { inputs, events } = runPolicy({ seed, snapshot, enemies, ruleset: RULESET }, POLICIES.interrupt);
      const ended = events.find((e) => e.type === "FIGHT_ENDED");
      if (ended) found = { seed, inputs, endedTick: ended.tick };
    }
    expect(found).not.toBeNull();
    const { seed, inputs, endedTick } = found!;
    const battle = { intentId: "adv-1", status: "open" as const, seed, snapshot, rulesetVersion: RULESET.version, contentHash: "irrelevante-en-cliente", enemyId: enemyList(pickEnemies(seed, 3, ENEMIES)), inputs: [], result: null, digest: null, adventure: { day: "2026-09-07", attempt: 1, reward: null } };
    const storage = memoryStorage();
    const actions = { start: async () => ({ ok: true as const, battle }), resolve: async () => ({ ok: false as const, code: "x" }), replay: async () => ({ ok: false as const, code: "x" }) };
    const s = new TrainingSession(actions, () => "ignored", { storage });
    await s.start();
    // reproducir la política tick a tick hasta la frontera
    while (s.view!.tick <= endedTick && !s.awaitingContinue) {
      if (inputs.some((x) => x.tick === s.view!.tick)) s.skill();
      s.tick();
    }
    expect(s.awaitingContinue).toBe(true);
    expect(s.view).toMatchObject({ fight: 2, fights: 3, tick: endedTick + 1 });
    const before = s.view!.tick;
    s.tick(); s.tick();
    expect(s.view!.tick).toBe(before); // el interludio detiene el reloj
    expect(JSON.parse(storage.map.get("pet-adventure:adv-1")!)).toMatchObject({ tick: endedTick + 1 });
    // Nueva sesión con el mismo almacenamiento: reanuda en pausa, en el mismo tick y esperando Continuar
    const s2 = new TrainingSession(actions, () => "ignored", { storage });
    await s2.start();
    expect(s2.paused).toBe(true);
    expect(s2.awaitingContinue).toBe(true);
    expect(s2.view).toMatchObject({ fight: 2, tick: endedTick + 1 });
    expect(s2.inputs).toEqual(s.inputs);
    s2.continueFight(); s2.togglePause(); s2.tick();
    expect(s2.view!.tick).toBe(endedTick + 2);
    expect(s2.events.some((e) => e.type === "FIGHT_STARTED")).toBe(true);
  });

  it("sin log local, un intento abierto empieza en el tick 0 con el mismo seed", async () => {
    const battle = { intentId: "adv-2", status: "open" as const, seed: seedFromIndex(5), snapshot, rulesetVersion: RULESET.version, contentHash: "x", enemyId: "brote,brote,brote", inputs: [], result: null, digest: null, adventure: { day: "2026-09-07", attempt: 1, reward: null } };
    const s = new TrainingSession({ start: async () => ({ ok: true, battle }), resolve: async () => ({ ok: false, code: "x" }), replay: async () => ({ ok: false, code: "x" }) }, () => "z", { storage: memoryStorage() });
    await s.start();
    expect(s.view).toMatchObject({ tick: 0, fight: 1, fights: 3 });
    expect(s.paused).toBe(false);
  });

  it("al resolver, borra la entrada local", async () => {
    const storage = memoryStorage();
    const battle = { intentId: "adv-3", status: "open" as const, seed: seedFromIndex(7), snapshot, rulesetVersion: RULESET.version, contentHash: "x", enemyId: "brote", inputs: [], result: null, digest: null, adventure: { day: "2026-09-07", attempt: 1, reward: null } };
    const resolved = { ...battle, status: "resolved" as const, result: { outcome: "lose" as const, reason: "ko" as const, ticks: 1, petHp: 0, petHpMax: 1, enemyHp: 1, enemyHpMax: 1, damageDealt: 0, damageTaken: 1, causes: [], fight: 1 }, digest: "d" };
    const s = new TrainingSession({ start: async () => ({ ok: true, battle }), resolve: async () => ({ ok: true, battle: resolved, events: [] }), replay: async () => ({ ok: false, code: "x" }) }, () => "z", { storage });
    await s.start();
    s.skill(); s.tick();
    expect(storage.map.has("pet-adventure:adv-3")).toBe(true);
    s.phase = "resolving";
    await s.resolve();
    expect(storage.map.has("pet-adventure:adv-3")).toBe(false);
  });

  it("restoreLocal: un log que ya llega al final del combate pasa a resolving, no se queda en playing pausado", async () => {
    let found: { seed: string; inputs: ReturnType<typeof runPolicy>["inputs"]; ticks: number } | null = null;
    for (let i = 0; i < 200 && !found; i++) {
      const seed = seedFromIndex(i);
      const enemies = pickEnemies(seed, 3, ENEMIES);
      const { inputs, result } = runPolicy({ seed, snapshot, enemies, ruleset: RULESET }, POLICIES.interrupt);
      if (result.reason === "ko") found = { seed, inputs, ticks: result.ticks };
    }
    expect(found).not.toBeNull();
    const { seed, inputs, ticks } = found!;
    const battle = { intentId: "adv-restore", status: "open" as const, seed, snapshot, rulesetVersion: RULESET.version, contentHash: "irrelevante-en-cliente", enemyId: enemyList(pickEnemies(seed, 3, ENEMIES)), inputs: [], result: null, digest: null, adventure: { day: "2026-09-07", attempt: 1, reward: null } };
    const storage = memoryStorage();
    storage.setItem(`pet-adventure:${battle.intentId}`, JSON.stringify({ inputs, tick: ticks + 1 }));
    const actions = { start: async () => ({ ok: true as const, battle }), resolve: async () => ({ ok: false as const, code: "x" }), replay: async () => ({ ok: false as const, code: "x" }) };
    const s = new TrainingSession(actions, () => "ignored", { storage });
    await s.start();
    expect(s.phase).toBe("resolving");
    expect(s.view?.ended).toBe(true);
    expect(s.paused).toBe(false);
    expect(() => s.tick()).not.toThrow();
  });

  it("replaying: FIGHT_STARTED actualiza fight, enemyHp, fase, ulti, escudo y cooldown al repetirse", async () => {
    let found: { seed: string; events: ReturnType<typeof runPolicy>["events"]; result: ReturnType<typeof runPolicy>["result"]; inputs: ReturnType<typeof runPolicy>["inputs"]; enemies: ReturnType<typeof pickEnemies> } | null = null;
    for (let i = 0; i < 200 && !found; i++) {
      const seed = seedFromIndex(i);
      const enemies = pickEnemies(seed, 3, ENEMIES);
      const { inputs, events, result } = runPolicy({ seed, snapshot, enemies, ruleset: RULESET }, POLICIES.interrupt);
      if (events.some((e) => e.type === "FIGHT_STARTED")) found = { seed, events, result, inputs, enemies };
    }
    expect(found).not.toBeNull();
    const { seed, events, result, inputs, enemies } = found!;
    const battle = { intentId: "replay-fight2", status: "resolved" as const, seed, snapshot, rulesetVersion: RULESET.version, contentHash: "irrelevante-en-cliente", enemyId: enemyList(enemies), inputs, result, digest: "d", adventure: { day: "2026-09-07", attempt: 1, reward: null } };
    const actions = { start: async () => ({ ok: true as const, battle, events }), resolve: async () => ({ ok: false as const, code: "x" }), replay: async () => ({ ok: true as const, battle, events }) };
    const s = new TrainingSession(actions, () => "ignored");
    await s.start();
    expect(s.phase).toBe("done");
    await s.replay();
    expect(s.view?.fight).toBe(1);
    const fightStarted = events.find((e) => e.type === "FIGHT_STARTED");
    if (!fightStarted || fightStarted.type !== "FIGHT_STARTED") throw new Error("se buscó explícitamente un FIGHT_STARTED");
    while (s.view!.tick < fightStarted.tick) s.tick();
    expect(s.view).toMatchObject({ fight: fightStarted.fight, enemyHp: fightStarted.enemyHp, enemyHpMax: fightStarted.enemyHp, enemyPhase: "idle", ultiUsed: false, shield: 0, skillReadyAt: fightStarted.tick });
  });

  it("replaying: FIGHT_STARTED también renueva enemyHpMax, no solo enemyHp", async () => {
    // Los dos enemigos de r4.1 comparten hpMax, así que el log sintético es la única forma de
    // distinguir «arrancar el tramo a vida llena» de «heredar el máximo del tramo anterior».
    const chained = { ...battle, rulesetVersion: RULESET.version, contentHash: "x", enemyId: "brote,brote", status: "resolved" as const };
    const events = [
      { type: "BATTLE_STARTED" as const, seq: 0, tick: 0, petHp: 100, enemyHp: 200 },
      { type: "FIGHT_STARTED" as const, seq: 1, tick: 1, fight: 2, enemyId: "brote", petHp: 100, enemyHp: 999 },
    ];
    const actions = { start: async () => ({ ok: true as const, battle: chained, events }), resolve: async () => ({ ok: false as const, code: "x" }), replay: async () => ({ ok: true as const, battle: chained, events }) };
    const s = new TrainingSession(actions, () => "ignored");
    await s.start();
    await s.replay();
    expect(s.view?.enemyHpMax).not.toBe(999);
    s.tick(); s.tick();
    expect(s.view).toMatchObject({ fight: 2, enemyHp: 999, enemyHpMax: 999 });
  });
});
