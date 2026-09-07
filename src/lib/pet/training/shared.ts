import { replayBattle } from "../battle/replay";
import type { TrainingBattle } from "./types";

export const isIntent = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Una fila resuelta solo se devuelve si su digest se reproduce hoy: nada guardado se cree sin re-simular. */
export async function verifyResolved<B extends TrainingBattle>(battle: B): Promise<{ ok: true; battle: B; events: import("../battle/types").BattleEvent[] } | { ok: false; code: string }> {
  if (battle.status !== "resolved" || !battle.result || !battle.digest) return { ok: false, code: "NOT_RESOLVED" };
  const replay = await replayBattle(battle);
  if (!replay.ok) return replay;
  if (replay.digest !== battle.digest) return { ok: false, code: "DIGEST_MISMATCH" };
  return { ok: true, battle, events: replay.events };
}
