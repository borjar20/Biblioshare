import type { EventDescription, PlayEvent, SavedGameSummary, ToolId } from "./core/types";
import type { MtgState } from "./mtg/types";
import { MTG_EVENT_TYPES, type MtgEvent, type GameStartedEvent } from "./mtg/events";
import { mtgReducer, initialMtgState } from "./mtg/reducer";
import { describeEvent, finalRanking } from "./mtg/selectors";
import type { ScoreState } from "./score/types";
import {
  SCORE_EVENT_TYPES,
  type ScoreEvent,
  type GameStartedEvent as ScoreGameStartedEvent,
} from "./score/events";
import { scoreReducer, initialScoreState } from "./score/reducer";
import { describeEvent as describeScoreEvent, scoreRanking, totals } from "./score/selectors";

// Registro de DOMINIO: puro, sin React. El registro de UI (tablero, setup,
// resumen por toolId) es un fichero aparte en src/components/play/ — spec §6.
export type PlayGameState = MtgState | ScoreState; // unión que crece con cada herramienta (juego, no modo)

// Fallback para un evento cuyo `type` no es reconocido por la herramienta activa
// (finding 8 de la revisión final): la pantalla instrumento compartida sostiene
// PlayEvents genéricos venidos de game.log.committed, así que en esta frontera SÍ
// puede llegar un tipo desconocido en runtime (log corrupto, herramienta futura
// distinta) — a diferencia de describeEvent, que trabaja sobre MtgEvent ya
// tipado y por eso puede permitirse el switch exhaustivo sin `default`.
export const UNKNOWN_EVENT_DESCRIPTION: EventDescription = { key: "unknown", params: {} };

function isMtgEvent(event: PlayEvent): event is MtgEvent {
  return (MTG_EVENT_TYPES as ReadonlySet<string>).has(event.type);
}

function isScoreEvent(event: PlayEvent): event is ScoreEvent {
  return (SCORE_EVENT_TYPES as ReadonlySet<string>).has(event.type);
}

export type ToolModule = {
  init: (startedEvent: PlayEvent) => PlayGameState;
  reduce: (state: PlayGameState, event: PlayEvent) => PlayGameState;
  // Etiqueta cualquier PlayEvent para la pantalla instrumento compartida (finding
  // 6): sin esto, esa pantalla tendría que importar de `commander/` y conmutar
  // por toolId ella misma — justo lo que este registro existe para evitar.
  describe: (event: PlayEvent, state: PlayGameState) => EventDescription;
  // Datos planos para el hub y la navegación (spec §6): clave de i18n del
  // namespace `play` y ruta de configuración de una partida nueva. Sin
  // componentes ni React — eso vive en el registro de UI, aparte.
  i18nKey: string;
  setupRoute: string;
  // Parte específica del resumen sellado al guardar (fase 5). El común
  // (participantes, duración) lo pone buildSavedSummary.
  summarize: (state: PlayGameState) => Pick<SavedGameSummary, "winners" | "ranking" | "tool">;
};

function summarizeMtg(state: MtgState): Pick<SavedGameSummary, "winners" | "ranking" | "tool"> {
  const seatOf = new Map(state.setup.participants.map((p, seat) => [p.id, seat] as const));
  const ranking = finalRanking(state).map((entry) => ({
    seat: seatOf.get(entry.participantId) ?? -1,
    position: entry.position,
  }));
  return {
    winners: ranking.filter((r) => r.position === 1).map((r) => r.seat),
    ranking,
    tool: {
      mode: state.setup.mode,
      turns: state.turnCount,
      // Partner = nombres unidos; sin nombre escrito, null (empezar sin rellenar es camino de primera).
      commanders: state.setup.participants.map((p) => {
        const names = p.commanders.map((c) => c.name).filter(Boolean);
        return names.length > 0 ? names.join(" / ") : null;
      }),
    },
  };
}

function summarizeScore(state: ScoreState): Pick<SavedGameSummary, "winners" | "ranking" | "tool"> {
  const ranking = scoreRanking(state).map(({ seat, position }) => ({ seat, position }));
  return {
    winners: ranking.filter((r) => r.position === 1).map((r) => r.seat),
    ranking,
    tool: {
      rounds: state.rounds.length,
      direction: state.setup.direction,
      totals: totals(state),
      target: state.setup.target ?? null,
    },
  };
}

export const playTools: Record<ToolId, ToolModule> = {
  mtg: {
    i18nKey: "mtg",
    setupRoute: "/partidas/mtg/nueva",
    init: (e) => initialMtgState(e as GameStartedEvent),
    reduce: (s, e) => mtgReducer(s as MtgState, e as MtgEvent),
    describe: (event, state) =>
      isMtgEvent(event) ? describeEvent(event, state as MtgState) : UNKNOWN_EVENT_DESCRIPTION,
    summarize: (state) => summarizeMtg(state as MtgState),
  },
  score: {
    i18nKey: "score",
    setupRoute: "/partidas/puntuacion/nueva",
    init: (e) => initialScoreState(e as ScoreGameStartedEvent),
    reduce: (s, e) => scoreReducer(s as ScoreState, e as ScoreEvent),
    describe: (event, state) =>
      isScoreEvent(event) ? describeScoreEvent(event, state as ScoreState) : UNKNOWN_EVENT_DESCRIPTION,
    summarize: (state) => summarizeScore(state as ScoreState),
  },
};

export function buildSavedSummary(state: PlayGameState): SavedGameSummary {
  const partial = playTools[state.toolId].summarize(state);
  return {
    toolId: state.toolId,
    participants: state.setup.participants.map((p) =>
      p.kind === "user"
        ? { kind: p.kind, name: p.name, userId: p.userId }
        : { kind: p.kind, name: p.name },
    ),
    durationMs: (state.finishedAt ?? state.startedAt) - state.startedAt,
    ...partial,
  };
}
