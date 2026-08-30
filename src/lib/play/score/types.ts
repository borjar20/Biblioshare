import type { Participant, ToolGameState } from "@/lib/play/core/types";

// La herramienta NO especializa al participante (a diferencia de mtg): una
// puntuación solo necesita nombre y asiento. Si algún día hace falta más,
// se especializa entonces (YAGNI).
export type ScoreDirection = "highest" | "lowest";

/**
 * Límite OPCIONAL e INFORMATIVO: alcanzarlo vuelve la partida finalizable,
 * nunca terminada — el reducer lo ignora y la UI ofrece finalizar (spec §2).
 * Con `points` y direction "lowest", llegar a X te condena y gana el que
 * menos tiene (golf, dominó); con "highest", el que llega gana (UNO a 500).
 */
export type ScoreTarget = { kind: "rounds" | "points"; value: number };

export type ScoreSetup = {
  participants: Participant[]; // 2..8; el orden ES el orden de filas
  direction: ScoreDirection;
  target?: ScoreTarget;
};

export type ScoreState = ToolGameState<"score"> & {
  setup: ScoreSetup;
  rounds: number[][]; // rounds[i][seat]; totales y ranking son SELECTORES
  startedAt: number;
  finishedAt: number | null;
};
