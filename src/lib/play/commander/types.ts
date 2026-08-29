import type { Participant, ToolGameState } from "@/lib/play/core/types";

// La herramienta especializa al participante neutro del core (spec §2).
export type CommanderParticipant = Participant & {
  deckName?: string; // texto libre: sin catálogo de cartas MTG (issue #931)
  commanderName?: string;
};

export type CommanderSetup = {
  participants: CommanderParticipant[]; // el orden ES el orden de asientos en la mesa
  startingLife: number; // 40 por defecto (lo fija la UI, el motor no opina)
  startingSeat: number; // índice de asiento que empieza
};

export type EliminationReason = "life" | "poison" | "commander_damage" | "card" | "concede";
export type FinishReason = "last_standing" | "card" | "time" | "abandoned";

export type CommanderPlayerState = {
  participant: CommanderParticipant;
  life: number;
  poison: number;
  commanderDamage: Record<string, number>; // participantId del atacante -> daño acumulado
  // Solo cuenta la eliminación VIGENTE: player_restored la pone a null y una
  // posterior estrena order nuevo (spec §3, ranking).
  elimination: { order: number; round: number | null; reason?: EliminationReason } | null;
};

// Extiende la forma base del core (finding 6): toolId/status se heredan, no se
// redeclaran, para que un cambio en ToolGameState no pueda desincronizarse aquí.
export type CommanderState = ToolGameState<"commander"> & {
  setup: CommanderSetup;
  players: CommanderPlayerState[]; // mismo orden que setup.participants (asientos)
  activeSeat: number;
  round: number; // el «Turno N» de la UI es la ronda (spec §3, semántica de turnos)
  turnCount: number; // 0 = el tracker de turnos no se ha usado (es opcional)
  monarch: string | null; // participantId
  initiative: string | null;
  eliminationCounter: number;
  winner: string | null;
  finishReason: FinishReason | null;
  startedAt: number;
  finishedAt: number | null;
};
