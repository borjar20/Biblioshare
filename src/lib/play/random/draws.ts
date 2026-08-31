import type { BagItem } from "./types";

// Helpers de azar PUROS (spec §2): el RNG entra inyectado (default Math.random)
// para que los tests sean deterministas. Quien despacha llama a estos helpers y
// mete el RESULTADO en el payload del evento — el reducer nunca los llama.
export type Rng = () => number;

export const DICE_MAX_COUNT = 20;
export const DICE_MAX_SIDES = 1000;

// Entero uniforme en 0..n-1. El min() protege del borde rng() → valores
// pegados a 1 por redondeo flotante.
function intBelow(n: number, rng: Rng): number {
  return Math.min(Math.floor(rng() * n), n - 1);
}

export function rollDice(count: number, sides: number, rng: Rng = Math.random): number[] {
  if (!Number.isInteger(count) || count < 1 || count > DICE_MAX_COUNT) {
    throw new RangeError(`count fuera de 1..${DICE_MAX_COUNT}`);
  }
  if (!Number.isInteger(sides) || sides < 2 || sides > DICE_MAX_SIDES) {
    throw new RangeError(`sides fuera de 2..${DICE_MAX_SIDES}`);
  }
  return Array.from({ length: count }, () => intBelow(sides, rng) + 1);
}

export function flipCoin(rng: Rng = Math.random): "heads" | "tails" {
  return rng() < 0.5 ? "heads" : "tails";
}

export const COIN_MAX_COUNT = 5;

export function flipCoins(count: number, rng: Rng = Math.random): ("heads" | "tails")[] {
  if (!Number.isInteger(count) || count < 1 || count > COIN_MAX_COUNT) {
    throw new RangeError(`count fuera de 1..${COIN_MAX_COUNT}`);
  }
  return Array.from({ length: count }, () => flipCoin(rng));
}

// Fisher-Yates sobre copia: la entrada no se muta.
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = intBelow(i + 1, rng);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickFirst(players: readonly string[], rng: Rng = Math.random): string {
  if (players.length < 2) throw new RangeError("hacen falta al menos 2 jugadores");
  return players[intBelow(players.length, rng)];
}

// Round-robin sobre una permutación: tamaños que difieren como mucho en 1 (spec §4).
export function drawTeams(
  players: readonly string[],
  teamCount: number,
  rng: Rng = Math.random,
): string[][] {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > players.length - 1) {
    throw new RangeError("equipos fuera de 2..n-1");
  }
  const order = shuffle(players, rng);
  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  order.forEach((name, i) => teams[i % teamCount].push(name));
  return teams;
}

// Extracción ponderada por restantes. Tipos a 0 no reciben tickets.
export function drawFromBag(items: readonly BagItem[], rng: Rng = Math.random): string {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total <= 0) throw new RangeError("bolsa vacía");
  let ticket = intBelow(total, rng);
  for (const item of items) {
    if (ticket < item.count) return item.name;
    ticket -= item.count;
  }
  // Inalcanzable: ticket < total por construcción.
  return items[items.length - 1].name;
}
