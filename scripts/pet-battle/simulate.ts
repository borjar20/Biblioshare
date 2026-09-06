// Simulador de combate por CLI (criterio de salida de R1: re-simular sin UI).
//   npm run pet:battle -- run [--seed <32 hex>] [--profile lectora_larga] [--class wizard] [--policy interrupt] [--events] [--json]
//   npm run pet:battle -- calibrate [--seeds 200]
//   npm run pet:battle -- replay <fichero.json>      (salida de `run --json` o registro de pet_battles)
//   npm run pet:battle -- golden                      (escribe el ejemplo normativo)
// Requiere Node 22 (ver «Node» en el plan de R1). Sin red ni Supabase: solo el motor.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PET_CLASSES, isPetClass, type PetClass } from "../../src/lib/pet/classes";
import { CALIBRATION, calibrate, checkCalibration, formatReport } from "../../src/lib/pet/battle/calibration";
import { canonicalJson } from "../../src/lib/pet/battle/canonical";
import { BROTE, ENEMIES, RULESET, contentHash } from "../../src/lib/pet/battle/content";
import { simulate } from "../../src/lib/pet/battle/engine";
import { POLICIES, POLICY_IDS, runPolicy, type PolicyId } from "../../src/lib/pet/battle/policies";
import { PROFILE_IDS, snapshotForProfile, type ProfileId } from "../../src/lib/pet/battle/profiles";
import { isSeed, seedFromIndex } from "../../src/lib/pet/battle/prng";
import { battleDigest, resimulate } from "../../src/lib/pet/battle/record";
import type { BattleRecord } from "../../src/lib/pet/battle/types";

const NORMATIVE_PATH = "src/lib/pet/battle/__fixtures__/normative.json";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function pickProfile(): ProfileId {
  const p = arg("profile", "lectora_larga") as string;
  if (!(PROFILE_IDS as readonly string[]).includes(p)) fail(`perfil desconocido: ${p} (${PROFILE_IDS.join(", ")})`);
  return p as ProfileId;
}
function pickClass(): PetClass {
  const c = arg("class", "wizard") as string;
  if (!isPetClass(c)) fail(`clase desconocida: ${c} (${PET_CLASSES.join(", ")})`);
  return c;
}
function pickPolicy(): PolicyId {
  const p = arg("policy", "interrupt") as string;
  if (!(POLICY_IDS as readonly string[]).includes(p)) fail(`política desconocida: ${p} (${POLICY_IDS.join(", ")})`);
  return p as PolicyId;
}

async function run() {
  const seed = arg("seed", seedFromIndex(0)) as string;
  if (!isSeed(seed)) fail("--seed: 32 hex en minúsculas");
  const snapshot = snapshotForProfile(pickProfile(), pickClass());
  const ctx = { seed, snapshot, enemy: BROTE, ruleset: RULESET };
  const { inputs, events, result } = runPolicy(ctx, POLICIES[pickPolicy()]);
  const record: BattleRecord = { rulesetVersion: RULESET.version, contentHash: await contentHash(), enemyId: BROTE.id, seed, snapshot, inputs, result };
  const digest = await battleDigest(record, events);
  console.log(`seed ${seed} · ${snapshot.name} (${snapshot.petClass}, tramo ${snapshot.tier}, ${snapshot.hpMax} PV, atk ${snapshot.atk}) vs ${BROTE.name} (${result.enemyHpMax} PV)`);
  console.log(`resultado: ${result.outcome} por ${result.reason} en ${result.ticks} ticks (${(result.ticks * RULESET.tickMs) / 1000} s) · causas: ${result.causes.join(", ") || "—"}`);
  console.log(`daño hecho ${result.damageDealt}/${result.enemyHpMax} · recibido ${result.damageTaken}/${result.petHpMax} · inputs ${inputs.length} · eventos ${events.length}`);
  console.log(`digest ${digest}`);
  if (flag("events")) for (const e of events) console.log(JSON.stringify(e));
  if (flag("json")) console.log(JSON.stringify({ record, events, digest }, null, 2));
}

async function calib() {
  const seeds = Number(arg("seeds", String(CALIBRATION.seeds)));
  if (!Number.isInteger(seeds) || seeds < 1) fail("--seeds: entero positivo");
  const report = calibrate({ seeds });
  console.log(formatReport(report));
  const check = checkCalibration(report);
  if (!check.ok) {
    for (const f of check.failures) console.error(`✗ ${f}`);
    process.exit(1);
  }
  console.log("✓ calibración dentro de umbrales");
}

async function replay(file: string | undefined) {
  if (!file) fail("replay <fichero.json>");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { record?: BattleRecord; digest?: string } & Partial<BattleRecord>;
  const record = (parsed.record ?? parsed) as BattleRecord;
  const out = await resimulate(record, { ruleset: RULESET, enemies: ENEMIES, contentHash: await contentHash() });
  if (!out.ok) fail(`re-simulación rechazada: ${out.code}`);
  console.log(`re-simulado: ${out.result.outcome} por ${out.result.reason} en ${out.result.ticks} ticks · ${out.events.length} eventos · digest ${out.digest}`);
  if (parsed.digest && parsed.digest !== out.digest) fail(`digest distinto del guardado (${parsed.digest})`);
  console.log("✓ coincide");
}

/** Ejemplo normativo: el primer seed cuyos dos primeros anuncios son carga y luego
 *  guardia (así el ejemplo enseña las dos decisiones), con la política interrupt. */
async function golden() {
  const snapshot = snapshotForProfile("lectora_larga", "wizard");
  for (let i = 0; i < 10_000; i++) {
    const seed = seedFromIndex(i);
    const ctx = { seed, snapshot, enemy: BROTE, ruleset: RULESET };
    const kinds = simulate(ctx, [])
      .events.filter((e) => e.type === "TELEGRAPH_STARTED")
      .map((e) => (e.type === "TELEGRAPH_STARTED" ? e.kind : ""));
    if (kinds[0] !== "charge" || kinds[1] !== "guard") continue;
    const { inputs, events, result } = runPolicy(ctx, POLICIES.interrupt);
    const record: BattleRecord = { rulesetVersion: RULESET.version, contentHash: await contentHash(), enemyId: BROTE.id, seed, snapshot, inputs, result };
    const digest = await battleDigest(record, events);
    const material = canonicalJson({ ...record, events });
    mkdirSync(dirname(NORMATIVE_PATH), { recursive: true });
    writeFileSync(
      NORMATIVE_PATH,
      JSON.stringify({ seedIndex: i, record, events, digest, canonicalHead: material.slice(0, 240), canonicalLength: material.length }, null, 2) + "\n",
    );
    console.log(`escrito ${NORMATIVE_PATH}: seed ${seed} (índice ${i}), ${events.length} eventos, ${result.outcome} en ${result.ticks} ticks, digest ${digest}`);
    return;
  }
  fail("ningún seed en 10 000 empieza con carga y después guardia");
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "run") return run();
  if (cmd === "calibrate") return calib();
  if (cmd === "replay") return replay(process.argv[3]);
  if (cmd === "golden") return golden();
  fail("uso: run | calibrate [--seeds N] | replay <fichero> | golden");
}

main().catch((e: unknown) => fail(String(e instanceof Error ? e.stack : e)));
