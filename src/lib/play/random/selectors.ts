import type { EventDescription, PlayEvent } from "@/lib/play/core/types";
import type { RandomEvent } from "./events";

// Eventos que el feed enseña: los de RESULTADO. Configuración (players_set,
// bag_set) y cleared no son «resultados» — se deshacen igual, pero no se listan.
export const RESULT_EVENT_TYPES: ReadonlySet<RandomEvent["type"]> = new Set([
  "dice_rolled",
  "coin_flipped",
  "first_picked",
  "order_drawn",
  "teams_drawn",
  "bag_drawn",
] as RandomEvent["type"][]);

// Feed de resultados, del más nuevo al más viejo. Se detiene en el último
// cleared: «limpiar todo» borra el feed visible aunque el log conserve la
// historia — así deshacer el cleared lo recupera entero.
export function resultFeed(log: PlayEvent[], max: number): RandomEvent[] {
  const out: RandomEvent[] = [];
  for (let i = log.length - 1; i >= 0 && out.length < max; i--) {
    const event = log[i];
    if (event.type === "cleared") break;
    if ((RESULT_EVENT_TYPES as ReadonlySet<string>).has(event.type)) {
      out.push(event as RandomEvent);
    }
  }
  return out;
}

// {key, params} contra el namespace play.random.log.* — mismo contrato que los
// describe() de mtg/score.
export function describeRandomEvent(event: RandomEvent): EventDescription {
  switch (event.type) {
    case "dice_rolled": {
      const { count, sides, results } = event.payload;
      return {
        key: "dice",
        params: {
          expr: `${count}d${sides}`,
          rolls: results.join(" + "),
          total: results.reduce((a, b) => a + b, 0),
        },
      };
    }
    case "coin_flipped":
      return { key: event.payload.result === "heads" ? "coinHeads" : "coinTails", params: {} };
    case "first_picked":
      return { key: "first", params: { picked: event.payload.picked } };
    case "order_drawn":
      return { key: "order", params: { order: event.payload.order.join(", ") } };
    case "teams_drawn":
      return {
        key: "teams",
        params: { teams: event.payload.teams.map((t) => t.join(", ")).join(" — ") },
      };
    case "players_set":
      return { key: "playersSet", params: { count: event.payload.players.length } };
    case "bag_set":
      return { key: "bagSet", params: {} };
    case "bag_drawn":
      return { key: "bagDrawn", params: { name: event.payload.name } };
    case "cleared":
      return { key: "cleared", params: {} };
  }
}
