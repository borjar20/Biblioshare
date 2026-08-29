import type { EventDescription, PlayEvent, ToolId } from "./core/types";
import type { MtgState } from "./mtg/types";
import { MTG_EVENT_TYPES, type MtgEvent, type GameStartedEvent } from "./mtg/events";
import { mtgReducer, initialMtgState } from "./mtg/reducer";
import { describeEvent } from "./mtg/selectors";

// Registro de DOMINIO: puro, sin React. El registro de UI (tablero, setup,
// resumen por toolId) es un fichero aparte en src/components/play/ — spec §6.
export type PlayGameState = MtgState; // unión que crecerá con cada herramienta (juego, no modo)

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
  mtg: {
    i18nKey: "mtg",
    setupRoute: "/partidas/mtg/nueva",
    init: (e) => initialMtgState(e as GameStartedEvent),
    reduce: (s, e) => mtgReducer(s, e as MtgEvent),
    describe: (event, state) =>
      isMtgEvent(event) ? describeEvent(event, state as MtgState) : UNKNOWN_EVENT_DESCRIPTION,
  },
};
