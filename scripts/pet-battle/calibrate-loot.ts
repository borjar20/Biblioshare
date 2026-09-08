import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBattle, stepBattle, viewOf } from "../../src/lib/pet/battle/versions/r4.2/engine";
import { RULESET, ENEMIES } from "../../src/lib/pet/battle/versions/r4.2/content";
import { pickEnemies } from "../../src/lib/pet/battle/versions/r4.2/adventure";
import { createUltiPuzzle } from "../../src/lib/pet/battle/versions/r4.2/ulti";
import { seedFromIndex } from "../../src/lib/pet/battle/versions/r4.2/prng";
import { PROFILE_IDS, snapshotForProfile, type ProfileId } from "../../src/lib/pet/battle/profiles";
import type { BattleInit, BattleInput, BattleResult, LootItemId, Ruleset } from "../../src/lib/pet/battle/versions/r4.2/types";

const QUALITY = [8000, 9000, 10000, 11000, 12000];
const WEAPONS: LootItemId[] = ["sharp_bookmark", "heavy_ink_quill", "librarian_loupe"];
const AMULETS: LootItemId[] = ["last_page_amulet", "loan_pendant", "streak_medallion"];
const POLICIES = ["never", "spam", "interrupt_ulti", "vulnerability_ulti"] as const;
type Policy = typeof POLICIES[number];
const SCENARIOS = ["random", "brote", "caparazon", ...Array.from({ length: 8 }, (_, n) =>
  [0, 1, 2].map(bit => n & (1 << bit) ? "caparazon" : "brote").join(","))];
export interface LootCase { weapon: LootItemId | null; amulet: LootItemId | null; weaponQuality: number | null; amuletQuality: number | null }
export interface LootMetric extends LootCase {
  profile: string; scenario: string; policy: string; wins: number; samples: number; meanHp: number; meanTicks: number;
}
export function buildCases(): LootCase[] {
  const slots = (ids: LootItemId[]) => [null, ...ids.flatMap(itemId => QUALITY.map(qualityBp => ({ itemId, qualityBp })))];
  return slots(WEAPONS).flatMap(w => slots(AMULETS).map(a => ({ weapon: w?.itemId ?? null,
    amulet: a?.itemId ?? null, weaponQuality: w?.qualityBp ?? null, amuletQuality: a?.qualityBp ?? null })));
}

/** Same view and inputs as a player; no event arrays retained during measurements. */
export function runLootPolicy(ctx: BattleInit, policy: Policy): BattleResult {
  const state = createBattle(ctx);
  let seq = 0;
  while (!state.ended) {
    const v = viewOf(state);
    const inputs: BattleInput[] = [];
    const ultimate = policy !== "never" && policy !== "spam" && !v.ultiUsed && v.tick >= v.ultiReadyAt
      && (policy === "interrupt_ulti" || v.enemyPhase === "vulnerable" || !ctx.enemies[v.fight - 1].vulnerableTicks);
    if (ultimate) {
      const order = createUltiPuzzle(ctx.seed, v.tick).recipes[0].order.join("");
      inputs.push({ seq: seq++, tick: v.tick, action: "ulti", payload: { order } });
    } else if (v.tick >= v.skillReadyAt && (policy === "spam" || ((policy === "interrupt_ulti" || policy === "vulnerability_ulti")
      && (v.enemyPhase === "windup" || (policy === "vulnerability_ulti" && v.enemyPhase === "vulnerable"))))) {
      inputs.push({ seq: seq++, tick: v.tick, action: "skill", payload: {} });
    }
    stepBattle(ctx, state, inputs);
  }
  return state.result!;
}

interface Options {
  ruleset?: Ruleset;
  qualityStrata?: boolean;
  profiles?: readonly ProfileId[]; scenarios?: readonly string[]; policies?: readonly Policy[]; cases?: readonly LootCase[];
  onProfile?: (profile: ProfileId, metrics: LootMetric[]) => void;
}
export async function measureLootCases(seeds: number[], options: Options = {}): Promise<LootMetric[]> {
  if (!seeds.length || seeds.some(s => !Number.isSafeInteger(s) || s < 0)) throw new Error("INVALID_SEEDS");
  const metrics: LootMetric[] = [];
  for (const profile of options.profiles ?? PROFILE_IDS) {
    const base = snapshotForProfile(profile, "wizard");
    for (const scenario of options.scenarios ?? SCENARIOS) {
      // Quality stress uses paired seeds across all 256 copies, distributed over 66 strata.
      // Neutral balance runs retain the full seed set in every profile/scenario.
      const sampleSeeds = options.qualityStrata ? seeds.filter(seed => seed % (PROFILE_IDS.length * SCENARIOS.length)
        === PROFILE_IDS.indexOf(profile) * SCENARIOS.length + SCENARIOS.indexOf(scenario)) : seeds;
      if (!sampleSeeds.length) continue;
      const hexSeeds = sampleSeeds.map(seedFromIndex);
      const chains = hexSeeds.map(seed => scenario === "random" ? pickEnemies(seed, 3, ENEMIES)
        : scenario.split(",").map(id => { if (!Object.hasOwn(ENEMIES, id)) throw new Error("UNKNOWN_ENEMY"); return ENEMIES[id]; }));
      for (const c of options.cases ?? buildCases()) {
        const equipment = {
          weapon: c.weapon ? { copyId: "00000000-0000-4000-8000-000000000001", itemId: c.weapon, qualityBp: c.weaponQuality! } : null,
          amulet: c.amulet ? { copyId: "00000000-0000-4000-8000-000000000002", itemId: c.amulet, qualityBp: c.amuletQuality! } : null,
        };
        for (const policy of options.policies ?? POLICIES) {
          let wins = 0, hp = 0, ticks = 0;
          for (let i = 0; i < sampleSeeds.length; i++) {
            const r = runLootPolicy({ snapshot: { ...base, equipment }, seed: hexSeeds[i], ruleset: options.ruleset ?? RULESET, enemies: chains[i] }, policy);
            wins += Number(r.outcome === "win"); hp += r.petHp; ticks += r.ticks;
          }
          metrics.push({ ...c, profile, scenario, policy, wins, samples: sampleSeeds.length, meanHp: hp / sampleSeeds.length, meanTicks: ticks / sampleSeeds.length });
        }
      }
    }
    options.onProfile?.(profile, metrics);
  }
  return metrics;
}

async function main() {
  const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
  const count = Number(arg("--seeds", "200")), offset = Number(arg("--offset", "0"));
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(offset) || offset < 0) throw new Error("INVALID_SEEDS");
  const quick = process.argv.includes("--quick");
  const screening = process.argv.includes("--screening");
  const qualityStrata = process.argv.includes("--quality-strata");
  const output = arg("--out", ".superpowers/r4b-calibration.json");
  const options: Options = quick ? { profiles: ["nueva"], scenarios: ["random"] } : {};
  if (qualityStrata && (quick || screening)) throw new Error("INCOMPATIBLE_SAMPLING_MODES");
  options.qualityStrata = qualityStrata;
  const cooldown = Number(arg("--cooldown", String(RULESET.loot.cooldownTicks)));
  if (!Number.isSafeInteger(cooldown) || cooldown < 1 || cooldown >= RULESET.pet.skillCooldown) throw new Error("INVALID_COOLDOWN");
  options.ruleset = { ...RULESET, loot: { ...RULESET.loot, cooldownTicks: cooldown } };
  // Neutral quality isolates type tradeoffs; full run still enumerates all 256 quality combinations.
  if (screening) options.cases = buildCases().filter(c => [null, 10000].includes(c.weaponQuality) && [null, 10000].includes(c.amuletQuality));
  const started = performance.now();
  const save = (metrics: LootMetric[]) => writeFileSync(output, JSON.stringify({ ruleset: options.ruleset, count, offset, quick, screening, qualityStrata, elapsedMs: performance.now() - started, metrics }));
  options.onProfile = (profile, metrics) => { save(metrics); console.log(`${profile}: ${metrics.length} rows saved (${Math.round((performance.now() - started) / 1000)}s)`); };
  const metrics = await measureLootCases(Array.from({ length: count }, (_, i) => i + offset), options);
  save(metrics);
  console.log(`Saved ${metrics.length} rows to ${output}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main().catch(e => { console.error(e); process.exitCode = 1; });
