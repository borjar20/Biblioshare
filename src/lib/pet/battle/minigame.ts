// Instancia del minijuego de la ulti (Parte I §6 regla 4, §16.3; contrato C11):
// sale de (seed, tick, familia), nunca la elige el cliente. R3 le pone tema y
// widget; aquí solo la derivación y la puntuación que el servidor recalcula.
import { nextInt, subStream, type PrngState } from "./prng";

export type MinigameFamily = "A" | "B";

export interface MinigameInstance {
  family: MinigameFamily;
  tick: number;
  /** Fichas en el orden en que se muestran. */
  tokens: number[];
  /** solution[ficha] = hueco correcto. */
  solution: number[];
}

function shuffle(rng: PrngState, items: number[]): number[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function minigameInstance(seed: string, tick: number, family: MinigameFamily, k = 4): MinigameInstance {
  if (!Number.isInteger(k) || k < 2 || k > 4) throw new Error("MINIGAME_K");
  const rng = subStream(seed, `ulti:${family}`, tick);
  const base = Array.from({ length: k }, (_, i) => i);
  const solution = shuffle(rng, base);
  const tokens = shuffle(rng, base);
  return { family, tick, tokens, solution };
}

/** Huecos acertados (0..k). `assignment[ficha] = hueco`; debe ser una permutación. */
export function scoreAssignment(inst: MinigameInstance, assignment: number[]): number {
  const k = inst.solution.length;
  if (assignment.length !== k || new Set(assignment).size !== k || assignment.some((h) => !Number.isInteger(h) || h < 0 || h >= k)) {
    throw new Error("MINIGAME_ASSIGNMENT");
  }
  let score = 0;
  for (let i = 0; i < k; i++) if (assignment[i] === inst.solution[i]) score++;
  return score;
}
