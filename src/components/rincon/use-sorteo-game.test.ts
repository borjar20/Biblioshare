import { describe, expect, it } from "vitest";
import { gameReducer, INITIAL_GAME, type GameAction, type GameState } from "./use-sorteo-game";
import type { SorteoItem } from "./sorteo-logic";

const it_ = (id: string): SorteoItem => ({
  itemType: "book", itemId: id, title: id, subtitle: null, coverUrl: null, metaText: "",
  estimatedMinutes: null, estimateText: null, fresh: true, collectionIds: [],
  plannedSince: "2026-01-01T00:00:00Z", totalEpisodes: null,
});
const run = (actions: GameAction[], from: GameState = INITIAL_GAME) => actions.reduce(gameReducer, from);
const chosen = run([{ type: "loaded", empty: false }]);

describe("gameReducer", () => {
  it("carga: choose, vacío o error, y reintento", () => {
    expect(chosen.phase).toBe("choose");
    expect(run([{ type: "loaded", empty: true }]).phase).toBe("empty");
    expect(run([{ type: "failed" }, { type: "reload" }]).phase).toBe("loading");
  });

  it("tres candidatos: presentación completa → descarte → duelo → suerte → ganador", () => {
    let s = run([{ type: "roll", candidates: [it_("a"), it_("b"), it_("c")] }, { type: "rolled" }], chosen);
    expect(s.phase).toBe("present");
    s = run([{ type: "presentNext" }, { type: "presentNext" }, { type: "presentNext" }], s);
    expect(s.presented).toBe(3);
    expect(s.phase).toBe("present");
    s = gameReducer(s, { type: "presentNext" });
    expect(s.phase).toBe("discard");
    s = gameReducer(s, { type: "discard", index: 1 });
    expect(s.phase).toBe("discarded");
    expect(s.discarded?.itemId).toBe("b");
    expect(s.candidates.map((c) => c.itemId)).toEqual(["a", "c"]);
    s = run([{ type: "toDuel" }, { type: "luck" }, { type: "win", index: 1 }], s);
    expect(s.phase).toBe("reveal");
    expect(s.winner?.itemId).toBe("c");
  });

  it("elegir tú: pick + confirmPick → duelPicked → win", () => {
    const duel = run([{ type: "roll", candidates: [it_("a"), it_("b")] }, { type: "rolled" }, { type: "skipPresent" }], chosen);
    expect(duel.phase).toBe("duel");
    expect(gameReducer(duel, { type: "confirmPick" }).phase).toBe("duel"); // sin pick no hace nada
    const s = run([{ type: "pick", index: 0 }, { type: "confirmPick" }], duel);
    expect(s.phase).toBe("duelPicked");
    expect(gameReducer(s, { type: "win", index: 0 }).winner?.itemId).toBe("a");
  });

  it("un solo candidato: revelación directa en solitario", () => {
    const s = run([{ type: "roll", candidates: [it_("a")] }, { type: "rolled" }, { type: "skipPresent" }], chosen);
    expect(s.phase).toBe("reveal");
    expect(s.solo).toBe(true);
  });

  it("saltar al duelo desde la tirada recorta a dos", () => {
    const s = run([{ type: "roll", candidates: [it_("a"), it_("b"), it_("c")] }, { type: "skipToDuel" }], chosen);
    expect(s.phase).toBe("duel");
    expect(s.candidates).toHaveLength(2);
  });

  it("roll sin candidatos o fuera de choose no hace nada", () => {
    expect(gameReducer(chosen, { type: "roll", candidates: [] })).toBe(chosen);
    expect(gameReducer(INITIAL_GAME, { type: "roll", candidates: [it_("a")] })).toBe(INITIAL_GAME);
  });

  it("CTA: start → startDone; fallo vuelve a reveal con error; again reinicia", () => {
    const reveal = run([{ type: "roll", candidates: [it_("a")] }, { type: "rolled" }, { type: "skipPresent" }], chosen);
    expect(run([{ type: "start" }, { type: "startDone" }], reveal).phase).toBe("started");
    const failed = run([{ type: "start" }, { type: "startFailed" }], reveal);
    expect(failed.phase).toBe("reveal");
    expect(failed.ctaError).toBe(true);
    expect(gameReducer(failed, { type: "again" })).toEqual({ ...INITIAL_GAME, phase: "choose" });
  });

  it("reset vuelve a loading desde cualquier fase", () => {
    expect(gameReducer(chosen, { type: "reset" })).toEqual(INITIAL_GAME);
  });
});
