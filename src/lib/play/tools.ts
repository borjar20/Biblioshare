import type { EventDescription, PlayEvent, ToolId } from "./core/types";
import type { CommanderState } from "./commander/types";
import { COMMANDER_EVENT_TYPES, type CommanderEvent, type GameStartedEvent } from "./commander/events";
import { commanderReducer, initialCommanderState } from "./commander/reducer";
import { describeEvent } from "./commander/selectors";

// Registro de DOMINIO: puro, sin React. El registro de UI (tablero, setup,
// resumen por toolId) es un fichero aparte en src/components/play/ — spec §6.
export type PlayGameState = CommanderState; // unión que crecerá con cada herramienta

// Fallback para un evento cuyo `type` no es reconocido por la herramienta activa
// (finding 8 de la revisión final): la pantalla instrumento compartida sostiene
// PlayEvents genéricos venidos de game.log.committed, así que en esta frontera SÍ
// puede llegar un tipo desconocido en runtime (log corrupto, herramienta futura
// distinta) — a diferencia de describeEvent, que trabaja sobre CommanderEvent ya
// tipado y por eso puede permitirse el switch exhaustivo sin `default`.
export const UNKNOWN_EVENT_DESCRIPTION: EventDescription = { key: "unknown", params: {} };

function isCommanderEvent(event: PlayEvent): event is CommanderEvent {
  return (COMMANDER_EVENT_TYPES as ReadonlySet<string>).has(event.type);
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
};

export const playTools: Record<ToolId, ToolModule> = {
  commander: {
    i18nKey: "commander",
    setupRoute: "/partidas/commander/nueva",
    init: (e) => initialCommanderState(e as GameStartedEvent),
    reduce: (s, e) => commanderReducer(s, e as CommanderEvent),
    describe: (event, state) =>
      isCommanderEvent(event) ? describeEvent(event, state as CommanderState) : UNKNOWN_EVENT_DESCRIPTION,
  },
};
