import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { ClockEvent } from "./events";
import { clockReducer } from "./reducer";
import { initialClockState } from "./types";
import { flaggedAt, formatMs, remainingAt } from "./selectors";

const ev = <T extends ClockEvent["type"]>(
  type: T,
  at: number,
  payload: Extract<ClockEvent, { type: T }>["payload"],
) => makeEvent(type, payload, at) as ClockEvent;

const chessAt1000 = [
  ev("chess_configured", 1000, { players: ["Ana", "Beto"], initialMs: 60_000, incrementMs: 0 }),
].reduce(clockReducer, initialClockState());

describe("remainingAt", () => {
  it("descuenta lo corrido solo al jugador activo", () => {
    expect(remainingAt(chessAt1000, 11_000, 0)).toBe(50_000);
    expect(remainingAt(chessAt1000, 11_000, 1)).toBe(60_000);
  });
  it("en pausa el tiempo no corre", () => {
    const paused = clockReducer(chessAt1000, ev("clock_paused", 11_000, {}));
    expect(remainingAt(paused, 99_000, 0)).toBe(50_000);
  });
  it("cuenta atrás corriendo se clava en 0", () => {
    const cd = [
      ev("countdown_configured", 1000, { durationMs: 5_000 }),
      ev("countdown_started", 2000, {}),
    ].reduce(clockReducer, initialClockState());
    expect(remainingAt(cd, 4_000)).toBe(3_000);
    expect(remainingAt(cd, 60_000)).toBe(0);
  });
});

describe("flaggedAt", () => {
  it("cruza en vivo sin esperar liquidación y persiste tras liquidar", () => {
    expect(flaggedAt(chessAt1000, 30_000, 0)).toBe(false);
    expect(flaggedAt(chessAt1000, 61_001, 0)).toBe(true); // en vivo
    const settled = clockReducer(chessAt1000, ev("turn_passed", 62_000, {}));
    expect(flaggedAt(settled, 62_000, 0)).toBe(true); // persistida
  });
  it("cuenta atrás: bandera al llegar a 0", () => {
    const cd = [
      ev("countdown_configured", 1000, { durationMs: 5_000 }),
      ev("countdown_started", 2000, {}),
    ].reduce(clockReducer, initialClockState());
    expect(flaggedAt(cd, 6_000)).toBe(false);
    expect(flaggedAt(cd, 7_001)).toBe(true);
  });
});

describe("formatMs", () => {
  it("m:ss, h:mm:ss y negativo con signo", () => {
    expect(formatMs(7_000)).toBe("0:07");
    expect(formatMs(754_000)).toBe("12:34");
    expect(formatMs(3_723_000)).toBe("1:02:03");
    expect(formatMs(-5_000)).toBe("−0:05");
    expect(formatMs(0)).toBe("0:00");
  });
});
