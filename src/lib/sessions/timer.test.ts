import { describe, expect, it } from "vitest";
import { elapsedMs, isStale, pause, reset, start, toMinutes, type TimerState } from "./timer";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe("cronometro", () => {
  it("no cuenta mientras esta en pausa", () => {
    const paused: TimerState = { startedAt: null, accumulatedMs: 5 * MIN };
    expect(elapsedMs(paused, T0 + 99 * MIN)).toBe(5 * MIN);
  });

  it("cuenta el tiempo transcurrido desde el arranque", () => {
    const running = start({ startedAt: null, accumulatedMs: 0 }, T0);
    expect(elapsedMs(running, T0 + 3 * MIN)).toBe(3 * MIN);
  });

  it("acumula tramos entre pausas", () => {
    let s = start(reset(), T0);
    s = pause(s, T0 + 10 * MIN);
    s = start(s, T0 + 60 * MIN);
    expect(elapsedMs(s, T0 + 65 * MIN)).toBe(15 * MIN);
  });

  it("sigue contando aunque la pagina estuviera cerrada", () => {
    // El estado guarda el instante de arranque, no un intervalo corriendo.
    const running = start(reset(), T0);
    expect(toMinutes(elapsedMs(running, T0 + 45 * MIN))).toBe(45);
  });

  it("detecta que te lo dejaste corriendo", () => {
    const running = start(reset(), T0);
    expect(isStale(running, T0 + 3 * 60 * MIN)).toBe(false);
    expect(isStale(running, T0 + 5 * 60 * MIN)).toBe(true);
  });

  it("redondea a minutos", () => {
    expect(toMinutes(89_000)).toBe(1);
    expect(toMinutes(91_000)).toBe(2);
  });

  it("firstStartedAt es el PRIMER arranque y sobrevive a las pausas (P8)", () => {
    // La hora real de inicio de "Cuándo lees": el primer start la fija, pausar
    // y volver a arrancar NO la mueve, reset la limpia.
    let s = start(reset(), T0);
    expect(s.firstStartedAt).toBe(T0);
    s = pause(s, T0 + 10 * MIN);
    expect(s.firstStartedAt).toBe(T0);
    s = start(s, T0 + 60 * MIN);
    expect(s.firstStartedAt).toBe(T0);
    expect(reset().firstStartedAt).toBeNull();
  });
});

// El cronómetro de la tarjeta de hoy (plan 01 T5) para el reloj y manda los
// minutos a la vista de sesión por la URL. Estas son las dos puntas de ese
// contrato: cuánto ha pasado al pausar, y qué se acepta al recibirlo.
describe("cronómetro de la tarjeta de hoy", () => {
  it("pausar congela el tiempo: lo que llega a la URL no sigue creciendo", () => {
    const running = start(reset(), T0);
    const stoppedAt = T0 + 25 * MIN;
    const stopped = pause(running, stoppedAt);
    expect(toMinutes(elapsedMs(stopped, stoppedAt))).toBe(25);
    // Diez minutos después de pulsar Registrar sigue diciendo 25.
    expect(toMinutes(elapsedMs(stopped, stoppedAt + 10 * MIN))).toBe(25);
  });

  it("una sesión de segundos redondea a 0 y no viaja a la URL", () => {
    const running = start(reset(), T0);
    expect(toMinutes(elapsedMs(pause(running, T0 + 20_000), T0 + 20_000))).toBe(0);
  });
});
