import type { EventDescription, PlayEvent } from "@/lib/play/core/types";
import type { RandomEvent } from "./events";

// Eventos que el feed enseña: los de RESULTADO. Configuración (players_set,
// bag_set) y cleared no son «resultados» — se deshacen igual, pero no se listan.
export const RESULT_EVENT_TYPES: ReadonlySet<RandomEvent["type"]> = new Set([
  "dice_rolled",
  "coin_flipped",
  "coins_flipped",
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
    case "coins_flipped": {
      const { results } = event.payload;
      if (results.length === 1) {
        return { key: results[0] === "heads" ? "coinHeads" : "coinTails", params: {} };
      }
      const heads = results.filter((r) => r === "heads").length;
      return { key: "coins", params: { heads, tails: results.length - heads } };
    }
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

// Fila del feed visual: etiqueta (mono), valor protagonista (serif) y desglose
// opcional. `string` = literal ya resuelto (números, nombres); `{key}` = clave
// i18n relativa a play.random que la UI traduce.
export type FeedText = string | { key: string; params?: Record<string, string | number> };
export type FeedRow = { label: FeedText; primary: FeedText; detail?: string };

export function feedRow(event: RandomEvent): FeedRow {
  switch (event.type) {
    case "dice_rolled": {
      const { count, sides, results } = event.payload;
      return {
        label: `${count}d${sides}`,
        primary: String(results.reduce((a, b) => a + b, 0)),
        ...(count > 1 ? { detail: results.join(" · ") } : {}),
      };
    }
    case "coin_flipped":
      return {
        label: { key: "row.coin" },
        primary: { key: event.payload.result === "heads" ? "coin.heads" : "coin.tails" },
      };
    case "coins_flipped": {
      const { results } = event.payload;
      if (results.length === 1) {
        return {
          label: { key: "row.coin" },
          primary: { key: results[0] === "heads" ? "coin.heads" : "coin.tails" },
        };
      }
      const heads = results.filter((r) => r === "heads").length;
      return {
        label: { key: "row.coins", params: { count: results.length } },
        primary: { key: "coin.result", params: { heads, tails: results.length - heads } },
      };
    }
    case "first_picked":
      return { label: { key: "row.first" }, primary: event.payload.picked };
    case "order_drawn":
      return { label: { key: "row.order" }, primary: event.payload.order.join(", ") };
    case "teams_drawn":
      return {
        label: { key: "row.teams" },
        primary: event.payload.teams.map((team) => team.join(", ")).join(" — "),
      };
    case "bag_drawn":
      return { label: { key: "row.bag" }, primary: event.payload.name };
    default:
      // players_set / bag_set / cleared no llegan al feed (RESULT_EVENT_TYPES).
      return { label: "", primary: "" };
  }
}
