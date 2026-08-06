import { describe, expect, it } from "vitest";
import {
  elapsedMs,
  isStale,
  pause,
  reset,
  start,
  timerStateFromWidget,
  toMinutes,
  widgetAnchor,
  widgetMirror,
  type TimerState,
} from "./timer";

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

// El reloj nativo del widget (Android) cuenta `now - ancla`. El ancla tiene que
// dar el MISMO transcurrido que elapsedMs para no sobre-contar los huecos
// pausados (#491), y ser estable mientras corre (si no, el Chronometer saltaría).
describe("ancla del widget nativo", () => {
  it("sin pausas el ancla es el arranque real", () => {
    const running = start(reset(), T0);
    expect(widgetAnchor(running)).toBe(T0);
  });

  it("tras pausar+reanudar, now - ancla == elapsedMs (no cuenta el hueco)", () => {
    let s = start(reset(), T0);
    s = pause(s, T0 + 10 * MIN); // 10 min leídos
    s = start(s, T0 + 60 * MIN); // hueco de 50 min pausado
    const now = T0 + 65 * MIN; // 15 min reales de lectura
    const anchor = widgetAnchor(s)!;
    expect(now - anchor).toBe(elapsedMs(s, now)); // 15 min, no 65
    expect(toMinutes(now - anchor)).toBe(15);
  });

  it("es estable mientras el reloj corre", () => {
    let s = start(reset(), T0);
    s = pause(s, T0 + 10 * MIN);
    s = start(s, T0 + 60 * MIN);
    expect(widgetAnchor(s)).toBe(widgetAnchor(s)); // no depende de `now`
  });

  it("en pausa no hay ancla efectiva (widgetMirror la manda como 0, #498)", () => {
    const paused = pause(start(reset(), T0), T0 + 5 * MIN);
    expect(widgetAnchor(paused)).toBeNull();
  });
});

describe("reconciliacion de los dos relojes (app <-> widget)", () => {
  it("widgetMirror: corriendo manda ancla efectiva + acumulado", () => {
    const s: TimerState = { startedAt: 2000, accumulatedMs: 500, firstStartedAt: 100 };
    expect(widgetMirror(s)).toEqual({
      passOp: "set",
      anchor: 1500,
      accumulatedMs: 500,
      running: true,
      firstStartedAt: 100,
    });
  });

  it("widgetMirror: pausado manda running=false y el acumulado", () => {
    const s: TimerState = { startedAt: null, accumulatedMs: 800, firstStartedAt: 100 };
    expect(widgetMirror(s)).toEqual({
      passOp: "set",
      anchor: 0,
      accumulatedMs: 800,
      running: false,
      firstStartedAt: 100,
    });
  });

  it("timerStateFromWidget: corriendo reconstruye el ancla idéntica", () => {
    const native = { anchor: 1500, accumulatedMs: 500, running: true, firstStartedAt: 100 };
    const st = timerStateFromWidget(native);
    expect(st.startedAt! - st.accumulatedMs).toBe(1500); // widgetAnchor(st) == anchor
  });

  it("timerStateFromWidget: pausado deja startedAt null y el acumulado", () => {
    const native = { anchor: 0, accumulatedMs: 800, running: false, firstStartedAt: 100 };
    expect(timerStateFromWidget(native)).toEqual({
      startedAt: null,
      accumulatedMs: 800,
      firstStartedAt: 100,
    });
  });

  it("round-trip: widgetMirror ∘ timerStateFromWidget conserva el estado corriendo", () => {
    const s: TimerState = { startedAt: 2000, accumulatedMs: 500, firstStartedAt: 100 };
    const m = widgetMirror(s);
    expect(timerStateFromWidget(m)).toEqual(s);
  });
});
