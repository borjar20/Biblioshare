import type { Participant, ToolGameState } from "@/lib/play/core/types";
import type { MtgMode } from "./modes";

/**
 * Un comandante tiene IDENTIDAD, no solo nombre. El daño se acumula por
 * comandante y no por jugador (regla de Magic: son 21 de CADA comandante por
 * separado), así que necesita una clave estable — el nombre no vale: es texto
 * libre, se puede editar y dos jugadores pueden llevar el mismo comandante.
 */
export type MtgCommander = {
  id: string;
  /** Texto libre; vacío es válido (se empieza a jugar sin rellenar nada). */
  name?: string;
};

// La herramienta especializa al participante neutro del core (spec §2).
export type MtgParticipant = Participant & {
  deckName?: string; // texto libre: sin catálogo de cartas MTG (issue #931)
  /**
   * SIEMPRE al menos uno, como máximo `maxCommanders` del modo. Se materializa
   * aunque el jugador no escriba nada: si no existiera, el daño de comandante
   * no tendría a qué atribuirse y el reducer necesitaría un caso especial para
   * los asientos sin nombre. Dos entradas = partner / background / companion.
   */
  commanders: MtgCommander[];
  /**
   * Fondo de la tarjeta en mesa: REFERENCIA (id de tinte, y en el futuro una
   * URL), nunca bytes. Un data-URI aquí acabaría dentro del log de eventos y
   * del snapshot de localStorage (issue #942).
   */
  cardBackground?: string;
};

export type MtgSetup = {
  mode: MtgMode;
  participants: MtgParticipant[]; // el orden ES el orden de asientos en la mesa
  startingLife: number; // por defecto el del modo; la UI puede sobreescribirlo
  startingSeat: number; // índice de asiento que empieza
};

export type EliminationReason = "life" | "poison" | "commander_damage" | "card" | "concede";
export type FinishReason = "last_standing" | "card" | "time" | "abandoned";

export type MtgPlayerState = {
  participant: MtgParticipant;
  life: number;
  poison: number;
  /**
   * Clave = `MtgCommander["id"]` del ATACANTE, no su participantId. Con partner,
   * indexar por jugador sumaría los dos comandantes contra el mismo umbral de 21
   * y mataría a alguien que en la mesa seguiría vivo.
   */
  commanderDamage: Record<string, number>;
  // Solo cuenta la eliminación VIGENTE: player_restored la pone a null y una
  // posterior estrena order nuevo (spec §3, ranking).
  elimination: { order: number; round: number | null; reason?: EliminationReason } | null;
};

// Extiende la forma base del core (finding 6): toolId/status se heredan, no se
// redeclaran, para que un cambio en ToolGameState no pueda desincronizarse aquí.
export type MtgState = ToolGameState<"mtg"> & {
  setup: MtgSetup;
  players: MtgPlayerState[]; // mismo orden que setup.participants (asientos)
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

/**
 * Índice comandante -> jugador que lo lleva. Lo necesitan el reducer (validar el
 * atacante), `rules` y la UI, y derivarlo a mano en cada sitio es justo la clase
 * de duplicación que se desincroniza.
 */
export function commanderOwners(state: MtgState): Map<string, string> {
  const out = new Map<string, string>();
  for (const player of state.players) {
    for (const commander of player.participant.commanders) {
      out.set(commander.id, player.participant.id);
    }
  }
  return out;
}
