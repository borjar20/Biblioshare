import type { PlayEvent } from "@/lib/play/core/types";
import type { BagItem, RandomState } from "./types";
import { RANDOM_EVENT_TYPES, type RandomEvent } from "./events";

// Reducer PURO del acompañante (spec §3): valida el payload y lanza ante uno
// inválido — el log es la fuente de verdad y un replay no puede aceptar
// basura en silencio. Jamás llama a Math.random()/Date.now().

export function initialRandomState(): RandomState {
  return { players: [], bag: { items: [], initial: [], withReplacement: false } };
}

function assertDice(payload: { count: number; sides: number; results: number[] }): void {
  const { count, sides, results } = payload;
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("count inválido");
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) throw new Error("sides inválido");
  if (results.length !== count) throw new Error("results no cuadra con count");
  for (const r of results) {
    if (!Number.isInteger(r) || r < 1 || r > sides) throw new Error("resultado fuera de rango");
  }
}

function assertCoins(payload: { count: number; results: ("heads" | "tails")[] }): void {
  const { count, results } = payload;
  if (!Number.isInteger(count) || count < 1 || count > 5) throw new Error("count inválido");
  if (results.length !== count) throw new Error("results no cuadra con count");
  for (const r of results) {
    if (r !== "heads" && r !== "tails") throw new Error("resultado inválido");
  }
}

function assertSameMembers(a: readonly string[], b: readonly string[]): void {
  if (a.length !== b.length) throw new Error("no es permutación");
  const left = [...a].sort();
  const right = [...b].sort();
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) throw new Error("no es permutación");
  }
}

function assertNames(names: readonly string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (name.trim() === "" || name !== name.trim()) throw new Error("nombre vacío o sin recortar");
    if (seen.has(name)) throw new Error("nombre duplicado");
    seen.add(name);
  }
}

function assertBagItems(items: readonly BagItem[]): void {
  assertNames(items.map((i) => i.name));
  for (const item of items) {
    if (!Number.isInteger(item.count) || item.count < 1) throw new Error("count de bolsa inválido");
  }
}

export function randomReducer(state: RandomState, event: RandomEvent): RandomState {
  switch (event.type) {
    // Eventos de RESULTADO: no cambian el estado, pero se validan igual —
    // viven en el log y el feed los renderiza.
    case "dice_rolled":
      assertDice(event.payload);
      return state;
    case "coin_flipped":
      return state;
    case "coins_flipped":
      assertCoins(event.payload);
      return state;
    case "first_picked": {
      const { players, picked } = event.payload;
      if (players.length < 2) throw new Error("hacen falta 2 jugadores");
      if (!players.includes(picked)) throw new Error("picked no está en players");
      return state;
    }
    case "order_drawn": {
      const { players, order } = event.payload;
      if (players.length < 2) throw new Error("hacen falta 2 jugadores");
      assertSameMembers(players, order);
      return state;
    }
    case "teams_drawn": {
      const { players, teams } = event.payload;
      if (teams.length < 2 || teams.length > players.length - 1) {
        throw new Error("equipos fuera de 2..n-1");
      }
      assertSameMembers(players, teams.flat());
      return state;
    }
    case "players_set":
      assertNames(event.payload.players);
      return { ...state, players: [...event.payload.players] };
    case "bag_set": {
      assertBagItems(event.payload.items);
      const items = event.payload.items.map((i) => ({ ...i }));
      return {
        ...state,
        bag: {
          items,
          initial: event.payload.items.map((i) => ({ ...i })),
          withReplacement: event.payload.withReplacement,
        },
      };
    }
    case "bag_drawn": {
      const { name } = event.payload;
      const item = state.bag.items.find((i) => i.name === name);
      if (!item || item.count < 1) throw new Error("tipo agotado o inexistente");
      if (state.bag.withReplacement) return state;
      return {
        ...state,
        bag: {
          ...state.bag,
          items: state.bag.items.map((i) => (i.name === name ? { ...i, count: i.count - 1 } : i)),
        },
      };
    }
    case "cleared":
      return initialRandomState();
  }
}

function isRandomEvent(event: PlayEvent): event is RandomEvent {
  return (RANDOM_EVENT_TYPES as ReadonlySet<string>).has(event.type);
}

// Replay desde base (o inicial). Lanza ante evento desconocido o payload
// inválido: quien carga descarta el registro corrupto y arranca de cero.
export function replayRandom(base: RandomState | null, log: PlayEvent[]): RandomState {
  return log.reduce((state, event) => {
    if (!isRandomEvent(event)) throw new Error(`evento desconocido: ${event.type}`);
    return randomReducer(state, event);
  }, base ?? initialRandomState());
}

// Compactación (spec §5): el log no crece sin límite. Al pasar el umbral se
// re-basa el estado y se conserva solo la cola — el feed enseña 20 y deshacer
// más allá no tiene caso de uso.
export const COMPACT_THRESHOLD = 200;
export const COMPACT_KEEP = 20;

export function compactIfNeeded(input: { base: RandomState | null; log: PlayEvent[] }): {
  base: RandomState | null;
  log: PlayEvent[];
} {
  if (input.log.length <= COMPACT_THRESHOLD) return input;
  const cut = input.log.length - COMPACT_KEEP;
  return {
    base: replayRandom(input.base, input.log.slice(0, cut)),
    log: input.log.slice(cut),
  };
}
