import { describe, expect, it, vi } from "vitest";
import { createAdventureService } from "./service";
import type { AdventureBattle, AdventureRepository } from "./types";
import { ENEMIES, RULESET, contentHash } from "@/lib/pet/battle/content";
import { parseEnemyList } from "@/lib/pet/battle/adventure";
import { POLICIES, runPolicy } from "@/lib/pet/battle/policies";
import { snapshotForProfile } from "@/lib/pet/battle/profiles";
import { seedFromIndex } from "@/lib/pet/battle/prng";
import { pickReward, rewardOrder } from "@/lib/pet/loot/reward";
import { LOOT_ITEMS } from "@/lib/pet/loot/catalog";
import { copyFromWin } from "@/lib/pet/loot/copies";
import { isBattleSnapshot } from "@/lib/pet/battle/snapshot";

const snapshot = snapshotForProfile("lectora_larga", "wizard");

/** Repositorio en memoria que imita el contrato atómico de las funciones SQL (§6). */
function memoryRepo(pending: string[]) {
  const rows: AdventureBattle[] = [];
  const days = new Set(pending);
  const won = (day: string) => rows.some((r) => r.adventure.day === day && r.status === "resolved" && r.result?.outcome === "win");
  const repo: AdventureRepository = {
    async selection() { return { weapon: null, amulet: null }; },
    async pendingDays() { return [...days].filter((d) => !rows.some((r) => r.adventure.day === d)).sort(); },
    async find(intentId) { return structuredClone(rows.find((r) => r.intentId === intentId) ?? null); },
    async recent(limit) { return structuredClone([...rows].reverse().slice(0, limit)); },
    async wins() { return structuredClone(rows.filter((r) => r.status === "resolved" && r.adventure.reward).map((r) => ({ day: r.adventure.day, reward: r.adventure.reward, copy: copyFromWin({ id: r.intentId, reward: r.adventure.reward, resolved_at: "2026-09-08T00:00:00Z" }) }))); },
    async start(input) {
      const open = rows.find((r) => r.status === "open");
      if (open) return structuredClone(open);
      const retry = rows.filter((r) => !won(r.adventure.day)).sort((a, b) => a.adventure.day.localeCompare(b.adventure.day))[0];
      const day = retry?.adventure.day ?? (await repo.pendingDays())[0];
      if (!day) return null;
      const attempt = retry ? Math.max(...rows.filter((r) => r.adventure.day === day).map((r) => r.adventure.attempt)) + 1 : 1;
      const row: AdventureBattle = { ...input, status: "open", inputs: [], result: null, digest: null, adventure: { day, attempt, reward: null } };
      rows.push(row);
      return structuredClone(row);
    },
    async resolve(input) {
      const row = rows.find((r) => r.intentId === input.intentId);
      if (!row) return null;
      if (row.status === "resolved") return structuredClone(row);
      const owned = rows.flatMap((r) => (r.adventure.reward ? [r.adventure.reward.itemId] : []));
      Object.assign(row, { status: "resolved", inputs: input.inputs, result: input.result, digest: input.digest });
      row.adventure.reward = input.result.outcome === "win" ? pickReward(input.rewardOrder, owned) : null;
      return structuredClone(row);
    },
  };
  return { repo, rows };
}

let intents = 0;
const service = (pending: string[]) => {
  const { repo, rows } = memoryRepo(pending);
  const wins: string[] = [];
  const s = createAdventureService({ repository: repo, snapshot: async () => snapshot, seed: () => seedFromIndex(++intents), newIntent: () => `54e5f63c-68a8-4acf-a790-${String(++intents).padStart(12, "0")}`, onWin: async (b) => { wins.push(b.adventure.day); } });
  return { s, rows, wins };
};

// `interrupt_ulti` es la política de referencia de R4a (gana ~56-60 % de las cadenas); con
// `interrupt` a secas (8-14 %) los bucles de 40 intentos de abajo serían una moneda al aire.
async function playToEnd(s: ReturnType<typeof createAdventureService>, battle: AdventureBattle, policy = POLICIES.interrupt_ulti) {
  if (!isBattleSnapshot(battle.snapshot)) throw new Error("Expected current snapshot");
  const enemies = parseEnemyList(battle.enemyId, ENEMIES)!;
  const { inputs } = runPolicy({ seed: battle.seed, snapshot: battle.snapshot, enemies, ruleset: RULESET }, policy);
  return s.resolve(battle.intentId, inputs);
}

describe("servicio de aventuras (spec §6)", () => {
  it("resume reads the exact open or resolved attempt without creating another", async () => {
    const {s,rows} = service(["2026-09-05", "2026-09-06"]);
    const started = await s.start(); if (!started.ok) throw new Error(started.code);
    expect(await s.resume(started.battle.intentId)).toEqual(started);
    const resolved = await playToEnd(s, started.battle); if (!resolved.ok) throw new Error(resolved.code);
    const recovered = await s.resume(started.battle.intentId);
    expect(recovered.ok && recovered.battle).toEqual(resolved.battle);
    expect(rows).toHaveLength(1);
    expect(await s.resume("invalid")).toEqual({ok:false,code:"INVALID_INTENT"});
    expect(await s.resume("54e5f63c-68a8-4acf-a790-000000999999")).toEqual({ok:false,code:"NOT_FOUND"});
    expect(rows).toHaveLength(1);
  });
  it("start consume el día más antiguo, guarda una lista de enemigos válida y es idempotente", async () => {
    const { s, rows } = service(["2026-09-05", "2026-09-06"]);
    const a = await s.start();
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.battle.adventure).toMatchObject({ day: "2026-09-05", attempt: 1 });
    expect(a.battle.enemyId.split(",")).toHaveLength(RULESET.adventure.chainLength);
    expect(parseEnemyList(a.battle.enemyId, ENEMIES)).not.toBeNull();
    expect(a.battle.rulesetVersion).toBe(RULESET.version);
    expect(a.battle.contentHash).toBe(await contentHash());
    expect(await s.start()).toEqual(a);
    expect(rows).toHaveLength(1);
  });
  it("sin días pendientes responde NO_ADVENTURE; sin mascota, NO_PET", async () => {
    expect(await service([]).s.start()).toEqual({ ok: false, code: "NO_ADVENTURE" });
    const { repo } = memoryRepo(["2026-09-06"]);
    const noPet = createAdventureService({ repository: repo, snapshot: async () => null, seed: () => seedFromIndex(1), newIntent: () => "54e5f63c-68a8-4acf-a790-000000000001" });
    expect(await noPet.start()).toEqual({ ok: false, code: "NO_PET" });
  });
  it("resolver re-simula, firma el digest, entrega botín al ganar y celebra una vez por día", async () => {
    const { s, wins } = service(["2026-09-06"]);
    // busca un intento que la política interrupt gane
    for (let i = 0; i < 40; i++) {
      const started = await s.start();
      if (!started.ok) throw new Error(started.code);
      const done = await playToEnd(s, started.battle);
      expect(done.ok).toBe(true);
      if (!done.ok) throw new Error(done.code);
      expect(done.battle.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(done.events?.length).toBeGreaterThan(0);
      if (done.battle.result?.outcome === "win") {
        expect(done.battle.adventure.reward).toEqual(pickReward(rewardOrder(done.battle.seed), []));
        expect(wins).toEqual(["2026-09-06"]);
        // resolver otra vez con inputs distintos devuelve lo guardado
        const again = await s.resolve(started.battle.intentId, []);
        expect(again.ok && again.battle.digest).toBe(done.battle.digest);
        expect(wins).toHaveLength(1);
        return;
      }
      expect(done.battle.adventure.reward).toBeNull();
      // tras perder, el siguiente start es otro intento del mismo día
      const retry = await s.start();
      expect(retry.ok && retry.battle.adventure).toMatchObject({ day: "2026-09-06", attempt: started.battle.adventure.attempt + 1 });
    }
    throw new Error("40 intentos sin victoria: revisar calibración");
  });
  it("rechaza inputs inválidos y un intent ajeno o inexistente", async () => {
    const { s } = service(["2026-09-06"]);
    const a = await s.start();
    if (!a.ok) throw new Error(a.code);
    expect(await s.resolve(a.battle.intentId, "no-es-array")).toEqual({ ok: false, code: "NOT_ARRAY" });
    expect(await s.resolve("54e5f63c-68a8-4acf-a790-999999999999", [])).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await s.resolve("no-uuid", [])).toEqual({ ok: false, code: "INVALID_INTENT" });
  });
  it("state expone pendientes, el intento en curso (abierto o perdido) e inventario derivado", async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const { s } = service(["2026-09-05", "2026-09-06"]);
      expect(await s.state()).toEqual({ pendingDays: ["2026-09-05", "2026-09-06"], current: null, inventory: [], loadout: { weapon: null, amulet: null } });
      const a = await s.start();
      if (!a.ok) throw new Error(a.code);
      let st = await s.state();
      expect(st.pendingDays).toEqual(["2026-09-06"]);
      expect(st.current?.intentId).toBe(a.battle.intentId);
      const done = await playToEnd(s, a.battle, POLICIES.never); // never pierde casi siempre
      if (!done.ok) throw new Error(done.code);
      if (done.battle.result?.outcome !== "lose") continue;
      st = await s.state();
      expect(st.current?.status).toBe("resolved");
      expect(st.current?.adventure.day).toBe("2026-09-05");
      return;
    }
    throw new Error("20 intentos sin derrota con POLICIES.never: revisar calibración");
  });
  it("el inventario y los días ganados salen del histórico completo, no de la ventana de recent(60)", async () => {
    const { s, rows } = service(["2026-09-06"]);
    let template: AdventureBattle | null = null;
    for (let i = 0; i < 40 && !template; i++) {
      const started = await s.start();
      if (!started.ok) throw new Error(started.code);
      const done = await playToEnd(s, started.battle);
      if (!done.ok) throw new Error(done.code);
      if (done.battle.result?.outcome === "win") template = done.battle;
    }
    if (!template) throw new Error("40 intentos sin victoria: revisar calibración");
    // 65 filas históricas resueltas y ganadas, con días y botín distintos: con la victoria real
    // y la derrota de abajo, la ventana de recent(60) ya no alcanza a las más antiguas.
    const day = (i: number) => `2000-01-${String(i).padStart(3, "0")}`;
    for (let i = 0; i < 65; i++) {
      rows.push({
        ...structuredClone(template),
        intentId: `54e5f63c-68a8-4acf-a790-${String(900000000000 + i).padStart(12, "0")}`,
        adventure: { day: day(i), attempt: 1, reward: { itemId: LOOT_ITEMS[i % LOOT_ITEMS.length].id, slot: LOOT_ITEMS[i % LOOT_ITEMS.length].slot } },
      });
    }
    // Intento perdido del día MÁS ANTIGUO: su victoria queda fuera de recent(60), así que si
    // `wonDays` se derivara de la ventana, este día volvería a ofrecerse como intento actual.
    rows.push({
      ...structuredClone(template),
      intentId: "54e5f63c-68a8-4acf-a790-999999000001",
      result: { ...template.result!, outcome: "lose" },
      adventure: { day: day(0), attempt: 2, reward: null },
    });
    const st = await s.state();
    expect(st.inventory).toHaveLength(66); // 65 sembradas + 1 victoria real
    expect(st.current).toBeNull();
  });
  it("una excepción en onWin no rompe una victoria ya guardada", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { repo } = memoryRepo(["2026-09-06"]);
      const s = createAdventureService({
        repository: repo, snapshot: async () => snapshot, seed: () => seedFromIndex(++intents),
        newIntent: () => `54e5f63c-68a8-4acf-a790-${String(++intents).padStart(12, "0")}`,
        onWin: async () => { throw new Error("celebración rota"); },
      });
      for (let i = 0; i < 40; i++) {
        const started = await s.start();
        if (!started.ok) throw new Error(started.code);
        const done = await playToEnd(s, started.battle);
        if (!done.ok) throw new Error(done.code);
        if (done.battle.result?.outcome === "win") {
          expect(done).toEqual({ ok: true, battle: done.battle, events: done.events });
          expect(spy).toHaveBeenCalled();
          return;
        }
      }
      throw new Error("40 intentos sin victoria: revisar calibración");
    } finally {
      spy.mockRestore();
    }
  });
});
