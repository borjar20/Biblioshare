import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayEvent } from "@/lib/play/core/types";
import { initialClockState, type ClockState } from "./types";
import type { ClockEvent } from "./events";
import {
  clockReducer,
  compactClockIfNeeded,
  replayClock,
  CLOCK_COMPACT_THRESHOLD,
} from "./reducer";

const ev = <T extends ClockEvent["type"]>(
  type: T,
  at: number,
  payload: Extract<ClockEvent, { type: T }>["payload"],
) => makeEvent(type, payload, at) as ClockEvent;

const chess = (at: number, players = ["Ana", "Beto"], initialMs = 60_000, incrementMs = 0) =>
  ev("chess_configured", at, { players, initialMs, incrementMs });

function run(events: ClockEvent[], base: ClockState | null = null): ClockState {
  return events.reduce(clockReducer, base ?? initialClockState());
}

describe("chess_configured", () => {
  it("configura bancos, activo 0 y sin pausa", () => {
    const s = run([chess(1000)]);
    expect(s.mode).toBe("chess");
    expect(s.players).toEqual([
      { name: "Ana", bankMs: 60_000, flagged: false },
      { name: "Beto", bankMs: 60_000, flagged: false },
    ]);
    expect(s.active).toBe(0);
    expect(s.paused).toBe(false);
    expect(s.lastEventAt).toBe(1000);
  });
  it("rechaza jugadores y rangos inválidos", () => {
    const s = initialClockState();
    expect(() => clockReducer(s, chess(1000, ["Ana"]))).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", "Ana"]))).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", " "]))).toThrow();
    expect(() =>
      clockReducer(s, chess(1000, ["a", "b", "c", "d", "e", "f", "g"])),
    ).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", "Beto"], 5_000))).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", "Beto"], 60_000, 61_000))).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", "Beto"], 60_000, -1))).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", "Beto"], 7_300_000))).toThrow();
  });
  it("acepta los extremos exactos (6 jugadores, 2 h)", () => {
    const s = clockReducer(
      initialClockState(),
      chess(1000, ["a", "b", "c", "d", "e", "f"], 7_200_000, 60_000),
    );
    expect(s.players).toHaveLength(6);
    expect(s.players[0].bankMs).toBe(7_200_000);
  });
});

describe("turn_passed — liquidación y Fischer", () => {
  it("cobra al activo y pasa al siguiente (circular)", () => {
    const s = run([chess(1000), ev("turn_passed", 11_000, {})]);
    expect(s.players[0].bankMs).toBe(50_000); // 10 s cobrados a Ana
    expect(s.players[1].bankMs).toBe(60_000);
    expect(s.active).toBe(1);
    const s2 = clockReducer(s, ev("turn_passed", 16_000, {}));
    expect(s2.players[1].bankMs).toBe(55_000);
    expect(s2.active).toBe(0); // circular
  });
  it("suma el incremento al que acaba de mover, también en negativo", () => {
    const s = run([chess(1000, ["Ana", "Beto"], 10_000, 5_000), ev("turn_passed", 26_000, {})]);
    // Ana gastó 25 s de 10 s: banco -15 s, +5 s de Fischer = -10 s, bandera puesta.
    expect(s.players[0].bankMs).toBe(-10_000);
    expect(s.players[0].flagged).toBe(true);
    expect(s.active).toBe(1);
  });
  it("inválido sin configurar o en pausa", () => {
    expect(() => clockReducer(initialClockState(), ev("turn_passed", 1000, {}))).toThrow();
    const paused = run([chess(1000), ev("clock_paused", 2000, {})]);
    expect(() => clockReducer(paused, ev("turn_passed", 3000, {}))).toThrow();
  });
});

describe("pausa y reanudación", () => {
  it("la pausa liquida y el intervalo pausado no se cobra", () => {
    const s = run([
      chess(1000),
      ev("clock_paused", 11_000, {}),   // Ana: 50 s
      ev("clock_resumed", 61_000, {}),  // 50 s de pausa: gratis
      ev("turn_passed", 66_000, {}),    // 5 s más de Ana
    ]);
    expect(s.players[0].bankMs).toBe(45_000);
    expect(s.paused).toBe(false);
  });
  it("pausar en pausa o reanudar sin pausa lanzan", () => {
    const paused = run([chess(1000), ev("clock_paused", 2000, {})]);
    expect(() => clockReducer(paused, ev("clock_paused", 3000, {}))).toThrow();
    const running = run([chess(1000)]);
    expect(() => clockReducer(running, ev("clock_resumed", 2000, {}))).toThrow();
  });
});

describe("bandera", () => {
  it("cruza una vez y no se desfija aunque el banco vuelva a positivo", () => {
    const s = run([
      chess(1000, ["Ana", "Beto"], 10_000, 60_000),
      ev("turn_passed", 12_000, {}), // Ana ok: 8 s + 60 s
      ev("turn_passed", 23_000, {}), // Beto gastó 11 s de 10: bandera, -1+60=59 s
    ]);
    expect(s.players[1].flagged).toBe(true);
    expect(s.players[1].bankMs).toBe(59_000);
    const s2 = clockReducer(s, ev("turn_passed", 24_000, {}));
    expect(s2.players[1].flagged).toBe(true); // persiste
  });
});

describe("cuenta atrás", () => {
  it("configura, arranca, liquida a 0 y no baja de ahí", () => {
    const s = run([
      ev("countdown_configured", 1000, { durationMs: 5_000 }),
      ev("countdown_started", 2000, {}),
      ev("clock_paused", 4000, {}), // 2 s consumidos, quedan 3 s
    ]);
    expect(s.countdownLeftMs).toBe(3_000);
    const done = run([
      ev("countdown_configured", 1000, { durationMs: 5_000 }),
      ev("countdown_started", 2000, {}),
      ev("countdown_reset", 60_000, {}), // llegó a 0 mucho antes: liquida a 0, luego recarga
    ]);
    expect(done.countdownLeftMs).toBe(5_000);
    expect(done.countdownRunning).toBe(false);
  });
  it("pausar una cuenta agotada lanza y arrancar de nuevo recarga primero", () => {
    const base = run([
      ev("countdown_configured", 1000, { durationMs: 5_000 }),
      ev("countdown_started", 2000, {}),
    ]);
    // A las 7.5 s la liquidación la deja en 0 y parada: pausar lanza.
    expect(() => clockReducer(base, ev("clock_paused", 7_500, {}))).toThrow();
    // Reset + start tras agotarse recarga a la duración completa.
    const restarted = clockReducer(
      clockReducer(base, ev("countdown_reset", 8_000, {})),
      ev("countdown_started", 9_000, {}),
    );
    expect(restarted.countdownRunning).toBe(true);
    expect(restarted.countdownLeftMs).toBe(5_000);
  });
  it("rechaza duraciones fuera de rango", () => {
    const s = initialClockState();
    expect(() =>
      clockReducer(s, ev("countdown_configured", 1000, { durationMs: 1_000 })),
    ).toThrow();
    expect(() =>
      clockReducer(s, ev("countdown_configured", 1000, { durationMs: 8_000_000 })),
    ).toThrow();
    // Máximo exacto válido (2 h): caza al mutante que estrecha el rango.
    const max = clockReducer(s, ev("countdown_configured", 1000, { durationMs: 7_200_000 }));
    expect(max.countdownLeftMs).toBe(7_200_000);
  });
});

describe("clock_reset", () => {
  it("vuelve a sin-configurar conservando la config para precargar", () => {
    const s = run([
      chess(1000, ["Ana", "Beto"], 60_000, 5_000),
      ev("turn_passed", 11_000, {}),
      ev("clock_reset", 20_000, {}),
    ]);
    expect(s.mode).toBeNull();
    expect(s.active).toBeNull();
    expect(s.players).toEqual([
      { name: "Ana", bankMs: 60_000, flagged: false },
      { name: "Beto", bankMs: 60_000, flagged: false },
    ]);
    expect(s.initialMs).toBe(60_000);
    expect(s.incrementMs).toBe(5_000);
  });
  it("sin modo configurado lanza", () => {
    expect(() => clockReducer(initialClockState(), ev("clock_reset", 1000, {}))).toThrow();
  });
});

describe("monotonía y replay", () => {
  it("un at hacia atrás lanza (log corrupto)", () => {
    const s = run([chess(1000)]);
    expect(() => clockReducer(s, ev("turn_passed", 999, {}))).toThrow();
  });
  it("replayClock rechaza eventos desconocidos", () => {
    const alien = makeEvent("dice_rolled", { count: 1, sides: 6, results: [3] }, 1000) as PlayEvent;
    expect(() => replayClock(null, [alien])).toThrow();
  });
});

describe("compactación", () => {
  it("re-basa conservando los bancos liquidados", () => {
    const log: ClockEvent[] = [chess(1000)];
    for (let i = 0; i < CLOCK_COMPACT_THRESHOLD; i++) {
      log.push(ev("turn_passed", 2000 + i * 1000, {}));
    }
    const before = replayClock(null, log);
    const compacted = compactClockIfNeeded({ base: null, log });
    expect(compacted.log.length).toBeLessThan(log.length);
    expect(replayClock(compacted.base, compacted.log)).toEqual(before);
  });
});
