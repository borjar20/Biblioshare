// Calibración de R2 «con perfiles sintéticos, no a ojo» (Parte II R1). Una celda
// = perfil × clase × política sobre N seeds reproducibles. Los umbrales son el
// criterio de salida de R2 en números: si la decisión correcta no gana o pulsar
// a ciegas gana, el contenido está mal, no el test.
import { pickEnemies } from "./adventure";
import { PET_CLASSES, type PetClass } from "../classes";
import { BROTE, ENEMIES, RULESET } from "./content";
import { POLICIES, POLICY_IDS, runPolicy, type PolicyId } from "./policies";
import { PROFILE_IDS, snapshotForProfile, type ProfileId } from "./profiles";
import { seedFromIndex } from "./prng";

export const CALIBRATION = {
  seeds: 200,
  win: { interruptMin: 0.85, spamMax: 0.35, neverMax: 0.05 },
  ticks: { interruptMeanMin: 300, interruptMeanMax: 560 },
  /** Cadenas (spec R4a §10): interrumpir gana entre el 50 y el 75 %, no pulsar menos del 1 %. */
  chain: { interruptMin: 0.5, interruptMax: 0.75, neverMax: 0.01 },
} as const;

export interface CalibrationCell {
  profile: ProfileId;
  petClass: PetClass;
  policy: PolicyId;
  fights: number;
  wins: number;
  draws: number;
  meanTicks: number;
}

export interface CalibrationReport {
  seeds: number;
  chain: number;
  cells: CalibrationCell[];
}

export function calibrate(opts: {
  seeds: number;
  chain?: number;
  profiles?: readonly ProfileId[];
  classes?: readonly PetClass[];
}): CalibrationReport {
  const chain = opts.chain ?? 1;
  const profiles = opts.profiles ?? PROFILE_IDS;
  const classes = opts.classes ?? PET_CLASSES;
  const cells: CalibrationCell[] = [];
  for (const profile of profiles) {
    for (const petClass of classes) {
      const snapshot = snapshotForProfile(profile, petClass);
      for (const policy of POLICY_IDS) {
        let wins = 0;
        let draws = 0;
        let ticks = 0;
        for (let i = 0; i < opts.seeds; i++) {
          const seed = seedFromIndex(i);
          const enemies = chain === 1 ? [BROTE] : pickEnemies(seed, chain, ENEMIES);
          const { result } = runPolicy({ seed, snapshot, enemies, ruleset: RULESET }, POLICIES[policy]);
          if (result.outcome === "win") wins++;
          else if (result.outcome === "draw") draws++;
          ticks += result.ticks;
        }
        cells.push({ profile, petClass, policy, fights: opts.seeds, wins, draws, meanTicks: Math.round(ticks / opts.seeds) });
      }
    }
  }
  return { seeds: opts.seeds, chain, cells };
}

interface Aggregate {
  fights: number;
  wins: number;
  ticks: number;
}

/** Agrega por política × perfil (las clases son idénticas en R2 y solo dispersarían). */
function aggregate(report: CalibrationReport): Map<string, Aggregate> {
  const map = new Map<string, Aggregate>();
  for (const c of report.cells) {
    const key = `${c.policy}|${c.profile}`;
    const a = map.get(key) ?? { fights: 0, wins: 0, ticks: 0 };
    a.fights += c.fights;
    a.wins += c.wins;
    a.ticks += c.meanTicks * c.fights;
    map.set(key, a);
  }
  return map;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function checkCalibration(report: CalibrationReport): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (report.chain > 1) {
    const C = CALIBRATION.chain;
    for (const [key, a] of aggregate(report)) {
      const [policy, profile] = key.split("|");
      const rate = a.wins / a.fights;
      if (policy === "interrupt" && (rate < C.interruptMin || rate > C.interruptMax)) {
        failures.push(`${profile}: interrupt gana ${pct(rate)}, fuera de [${pct(C.interruptMin)}, ${pct(C.interruptMax)}]`);
      }
      if (policy === "never" && rate > C.neverMax) failures.push(`${profile}: never gana ${pct(rate)} > ${pct(C.neverMax)}`);
    }
    return { ok: failures.length === 0, failures };
  }
  const W = CALIBRATION.win;
  const K = CALIBRATION.ticks;
  for (const [key, a] of aggregate(report)) {
    const [policy, profile] = key.split("|");
    const rate = a.wins / a.fights;
    const mean = a.ticks / a.fights;
    if (policy === "interrupt" && rate < W.interruptMin) failures.push(`${profile}: interrupt gana ${pct(rate)} < ${pct(W.interruptMin)}`);
    if (policy === "spam" && rate > W.spamMax) failures.push(`${profile}: spam gana ${pct(rate)} > ${pct(W.spamMax)}`);
    if (policy === "never" && rate > W.neverMax) failures.push(`${profile}: never gana ${pct(rate)} > ${pct(W.neverMax)}`);
    if (policy === "interrupt" && (mean < K.interruptMeanMin || mean > K.interruptMeanMax)) {
      failures.push(`${profile}: interrupt dura ${Math.round(mean)} ticks de media, fuera de [${K.interruptMeanMin}, ${K.interruptMeanMax}]`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function formatReport(report: CalibrationReport): string {
  const lines = [`seeds por celda: ${report.seeds} · tramos: ${report.chain}`, "política      perfil           victorias  media ticks"];
  for (const [key, a] of aggregate(report)) {
    const [policy, profile] = key.split("|");
    lines.push(`${policy.padEnd(13)} ${profile.padEnd(16)} ${pct(a.wins / a.fights).padStart(9)}  ${String(Math.round(a.ticks / a.fights)).padStart(11)}`);
  }
  return lines.join("\n");
}
