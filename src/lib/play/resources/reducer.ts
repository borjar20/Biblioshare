import type { PlayEvent } from "@/lib/play/core/types";
import { RESOURCES_EVENT_TYPES, type ResourcesEvent } from "./events";
import { initialResourcesState, type ResourceDef, type ResourcesState, type ResourceValue } from "./types";

// Reducer PURO del gestor de recursos (spec recursos §1): valida y lanza ante
// payload inválido, salvo el RANGO de `adjusted`, que se CLAMPA — un ajuste
// nunca muere en silencio por pasarse. Jamás llama a Date.now().

export const RESOURCES_MAX_PLAYERS = 6;
export const RESOURCES_MAX_DEFS = 8;
export const RESOURCE_VALUE_MIN = -9_999;
export const RESOURCE_VALUE_MAX = 9_999;

function assertPlayers(names: readonly string[]): void {
  if (names.length > RESOURCES_MAX_PLAYERS) {
    throw new Error(`jugadores fuera de 0..${RESOURCES_MAX_PLAYERS}`);
  }
  const seen = new Set<string>();
  for (const name of names) {
    if (name.trim() === "" || name !== name.trim()) throw new Error("nombre vacío o sin recortar");
    if (seen.has(name)) throw new Error("nombre duplicado");
    seen.add(name);
  }
}

const clamp = (n: number): number =>
  Math.min(Math.max(n, RESOURCE_VALUE_MIN), RESOURCE_VALUE_MAX);

// Reconstruye values para (players, defs) conservando los que sobreviven y
// creando a initial los nuevos — el invariante del estado vive aquí.
function reconcile(
  playersList: readonly string[],
  defs: readonly ResourceDef[],
  prev: readonly ResourceValue[],
): ResourceValue[] {
  const out: ResourceValue[] = [];
  for (const def of defs) {
    const owners: (string | null)[] = def.shared ? [null] : [...playersList];
    for (const owner of owners) {
      const kept = prev.find((v) => v.resource === def.name && v.owner === owner);
      out.push(kept ? { ...kept } : { resource: def.name, owner, value: def.initial });
    }
  }
  return out;
}

export function resourcesReducer(state: ResourcesState, event: ResourcesEvent): ResourcesState {
  switch (event.type) {
    case "players_set": {
      const { players } = event.payload;
      assertPlayers(players);
      return {
        players: [...players],
        defs: state.defs,
        values: reconcile(players, state.defs, state.values),
      };
    }
    case "resource_added": {
      const { name, emoji, initial, shared } = event.payload;
      if (name.trim() === "" || name !== name.trim()) throw new Error("nombre vacío o sin recortar");
      if (state.defs.some((d) => d.name === name)) throw new Error("recurso duplicado");
      if (state.defs.length >= RESOURCES_MAX_DEFS) throw new Error(`máximo ${RESOURCES_MAX_DEFS} recursos`);
      if (typeof emoji !== "string" || emoji.length > 8) throw new Error("emoji inválido");
      if (!Number.isInteger(initial) || initial < RESOURCE_VALUE_MIN || initial > RESOURCE_VALUE_MAX) {
        throw new Error("initial fuera de rango");
      }
      const defs = [...state.defs, { name, emoji, initial, shared }];
      return { ...state, defs, values: reconcile(state.players, defs, state.values) };
    }
    case "resource_removed": {
      const { name } = event.payload;
      if (!state.defs.some((d) => d.name === name)) throw new Error("recurso inexistente");
      const defs = state.defs.filter((d) => d.name !== name);
      return { ...state, defs, values: reconcile(state.players, defs, state.values) };
    }
    case "resource_updated": {
      const { name, initial, shared } = event.payload;
      if (!state.defs.some((d) => d.name === name)) throw new Error("recurso inexistente");
      if (!Number.isInteger(initial) || initial < RESOURCE_VALUE_MIN || initial > RESOURCE_VALUE_MAX) {
        throw new Error("initial fuera de rango");
      }
      // Solo cambia la definición: los valores que ya había se conservan y
      // «Reiniciar valores» es quien aplica el nuevo inicial. Cambiar de
      // dueño reconcilia (banco = una entrada; jugadores = una por cabeza).
      const defs = state.defs.map((d) => (d.name === name ? { ...d, initial, shared } : d));
      return { ...state, defs, values: reconcile(state.players, defs, state.values) };
    }
    case "adjusted": {
      const { resource, owner, delta } = event.payload;
      const def = state.defs.find((d) => d.name === resource);
      if (!def) throw new Error("recurso inexistente");
      if (def.shared && owner !== null) throw new Error("compartido no lleva owner");
      if (!def.shared && (owner === null || !state.players.includes(owner))) {
        throw new Error("owner inválido");
      }
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > RESOURCE_VALUE_MAX) {
        throw new Error("delta inválido");
      }
      return {
        ...state,
        values: state.values.map((v) =>
          v.resource === resource && v.owner === owner ? { ...v, value: clamp(v.value + delta) } : v,
        ),
      };
    }
    case "values_reset": {
      if (state.defs.length === 0) throw new Error("nada que reiniciar");
      const initialOf = new Map(state.defs.map((d) => [d.name, d.initial]));
      return {
        ...state,
        values: state.values.map((v) => ({ ...v, value: initialOf.get(v.resource) ?? 0 })),
      };
    }
    case "cleared":
      return initialResourcesState();
  }
}

function isResourcesEvent(event: PlayEvent): event is ResourcesEvent {
  return (RESOURCES_EVENT_TYPES as ReadonlySet<string>).has(event.type);
}

export function replayResources(base: ResourcesState | null, log: PlayEvent[]): ResourcesState {
  return log.reduce((state, event) => {
    if (!isResourcesEvent(event)) throw new Error(`evento desconocido: ${event.type}`);
    return resourcesReducer(state, event);
  }, base ?? initialResourcesState());
}

export const RESOURCES_COMPACT_THRESHOLD = 200;
export const RESOURCES_COMPACT_KEEP = 20;

export function compactResourcesIfNeeded(input: {
  base: ResourcesState | null;
  log: PlayEvent[];
}): { base: ResourcesState | null; log: PlayEvent[] } {
  if (input.log.length <= RESOURCES_COMPACT_THRESHOLD) return input;
  const cut = input.log.length - RESOURCES_COMPACT_KEEP;
  return {
    base: replayResources(input.base, input.log.slice(0, cut)),
    log: input.log.slice(cut),
  };
}
