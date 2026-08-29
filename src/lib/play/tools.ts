import type { PlayEvent, ToolId } from "./core/types";
import type { CommanderState } from "./commander/types";
import type { CommanderEvent, GameStartedEvent } from "./commander/events";
import { commanderReducer, initialCommanderState } from "./commander/reducer";

// Registro de DOMINIO: puro, sin React. El registro de UI (tablero, setup,
// resumen por toolId) es un fichero aparte en src/components/play/ — spec §6.
export type PlayGameState = CommanderState; // unión que crecerá con cada herramienta

export type ToolModule = {
  init: (startedEvent: PlayEvent) => PlayGameState;
  reduce: (state: PlayGameState, event: PlayEvent) => PlayGameState;
};

export const playTools: Record<ToolId, ToolModule> = {
  commander: {
    init: (e) => initialCommanderState(e as GameStartedEvent),
    reduce: (s, e) => commanderReducer(s, e as CommanderEvent),
  },
};
