import { nextInt, subStream } from "./prng";
export type UltiRecipe = "power" | "guard";
export function isUltiOrder(order: unknown): order is string {
  return typeof order === "string" && (order === "" || (order.length === 4 && [...order].sort().join("") === "0123"));
}
export function createUltiPuzzle(seed: string, tick: number): { recipes: { id: UltiRecipe; order: number[] }[] } {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error("BAD_TICK");
  const rng = subStream(seed, "r3.1:ulti", tick);
  const power = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = nextInt(rng, 0, i); [power[i], power[j]] = [power[j], power[i]]; }
  const guard = [...power];
  const a = nextInt(rng, 0, 3), b = (a + nextInt(rng, 1, 3)) % 4;
  [guard[a], guard[b]] = [guard[b], guard[a]];
  return { recipes: [{ id: "power", order: power }, { id: "guard", order: guard }] };
}
export function scoreUlti(seed: string, tick: number, order: string): { recipe: UltiRecipe | null; matches: number } {
  if (!isUltiOrder(order)) throw new Error("BAD_PAYLOAD");
  const puzzle = createUltiPuzzle(seed, tick);
  if (order === "") return { recipe: null, matches: 0 };
  const scores = puzzle.recipes.map(r => ({ recipe: r.id, matches: r.order.filter((n, i) => String(n) === order[i]).length }));
  return scores[1].matches > scores[0].matches ? scores[1] : scores[0];
}
