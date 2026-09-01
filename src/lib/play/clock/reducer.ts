import type { PlayEvent } from "@/lib/play/core/types";
import { CLOCK_EVENT_TYPES, type ClockEvent } from "./events";
import { initialClockState, type ClockState } from "./types";

// Reducer PURO del reloj (spec reloj §1): valida el payload y la monotonía de
// `at`, y LIQUIDA el tiempo transcurrido entre eventos antes de aplicar cada
// uno. Jamás llama a Date.now() — el tiempo viene en los eventos.

export const CLOCK_MAX_PLAYERS = 6;
export const CLOCK_INITIAL_MS_MIN = 10_000;
export const CLOCK_INITIAL_MS_MAX = 7_200_000;
export const CLOCK_INCREMENT_MS_MAX = 60_000;
export const CLOCK_DURATION_MS_MIN = 5_000;
export const CLOCK_DURATION_MS_MAX = 7_200_000;

function assertNames(names: readonly string[]): void {
  if (names.length < 2 || names.length > CLOCK_MAX_PLAYERS) {
    throw new Error(`jugadores fuera de 2..${CLOCK_MAX_PLAYERS}`);
  }
  const seen = new Set<string>();
  for (const name of names) {
    if (name.trim() === "" || name !== name.trim()) throw new Error("nombre vacío o sin recortar");
    if (seen.has(name)) throw new Error("nombre duplicado");
    seen.add(name);
  }
}

// Liquida el tiempo corrido entre lastEventAt y `at` sobre quien corresponda.
// También valida la monotonía: un log con tiempos hacia atrás está corrupto.
function settle(state: ClockState, at: number): ClockState {
  if (at < state.lastEventAt) throw new Error("timestamp hacia atrás");
  const elapsed = at - state.lastEventAt;
  if (state.mode === "chess" && state.active !== null && !state.paused) {
    const players = state.players.map((p, i) => {
      if (i !== state.active) return p;
      const bankMs = p.bankMs - elapsed;
      return { ...p, bankMs, flagged: p.flagged || bankMs <= 0 };
    });
    return { ...state, players, lastEventAt: at };
  }
  if (state.mode === "countdown" && state.countdownRunning && !state.paused) {
    const countdownLeftMs = Math.max(0, state.countdownLeftMs - elapsed);
    return { ...state, countdownLeftMs, countdownRunning: countdownLeftMs > 0, lastEventAt: at };
  }
  return { ...state, lastEventAt: at };
}

export function clockReducer(state: ClockState, event: ClockEvent): ClockState {
  const s = settle(state, event.at);
  switch (event.type) {
    case "chess_configured": {
      const { players, initialMs, incrementMs } = event.payload;
      assertNames(players);
      if (
        !Number.isInteger(initialMs) ||
        initialMs < CLOCK_INITIAL_MS_MIN ||
        initialMs > CLOCK_INITIAL_MS_MAX
      ) {
        throw new Error("initialMs fuera de rango");
      }
      if (
        !Number.isInteger(incrementMs) ||
        incrementMs < 0 ||
        incrementMs > CLOCK_INCREMENT_MS_MAX
      ) {
        throw new Error("incrementMs fuera de rango");
      }
      return {
        ...s,
        mode: "chess",
        players: players.map((name) => ({ name, bankMs: initialMs, flagged: false })),
        active: 0,
        initialMs,
        incrementMs,
        paused: false,
      };
    }
    case "countdown_configured": {
      const { durationMs } = event.payload;
      if (
        !Number.isInteger(durationMs) ||
        durationMs < CLOCK_DURATION_MS_MIN ||
        durationMs > CLOCK_DURATION_MS_MAX
      ) {
        throw new Error("durationMs fuera de rango");
      }
      return {
        ...s,
        mode: "countdown",
        durationMs,
        countdownLeftMs: durationMs,
        countdownRunning: false,
        paused: false,
      };
    }
    case "turn_passed": {
      if (s.mode !== "chess" || s.active === null) throw new Error("sin reloj de ajedrez activo");
      if (s.paused) throw new Error("en pausa");
      const mover = s.active;
      const players = s.players.map((p, i) =>
        i === mover ? { ...p, bankMs: p.bankMs + s.incrementMs } : p,
      );
      return { ...s, players, active: (mover + 1) % players.length };
    }
    case "clock_paused": {
      const chessRunning = s.mode === "chess" && s.active !== null && !s.paused;
      const countdownRunning = s.mode === "countdown" && s.countdownRunning && !s.paused;
      if (!chessRunning && !countdownRunning) throw new Error("nada corriendo que pausar");
      return { ...s, paused: true };
    }
    case "clock_resumed": {
      if (!s.paused) throw new Error("no está en pausa");
      return { ...s, paused: false };
    }
    case "countdown_started": {
      if (s.mode !== "countdown") throw new Error("sin cuenta atrás configurada");
      if (s.countdownRunning) throw new Error("ya corriendo");
      // Arrancar tras agotarse recarga primero.
      const countdownLeftMs = s.countdownLeftMs <= 0 ? s.durationMs : s.countdownLeftMs;
      return { ...s, countdownLeftMs, countdownRunning: true, paused: false };
    }
    case "countdown_reset": {
      if (s.mode !== "countdown") throw new Error("sin cuenta atrás configurada");
      return { ...s, countdownLeftMs: s.durationMs, countdownRunning: false, paused: false };
    }
    case "clock_reset": {
      if (s.mode === null) throw new Error("nada que reiniciar");
      return {
        ...s,
        mode: null,
        active: null,
        paused: false,
        countdownRunning: false,
        countdownLeftMs: s.durationMs,
        players: s.players.map((p) => ({ name: p.name, bankMs: s.initialMs, flagged: false })),
      };
    }
  }
}

function isClockEvent(event: PlayEvent): event is ClockEvent {
  return (CLOCK_EVENT_TYPES as ReadonlySet<string>).has(event.type);
}

// Replay desde base (o inicial). Lanza ante evento desconocido o inválido.
export function replayClock(base: ClockState | null, log: PlayEvent[]): ClockState {
  return log.reduce((state, event) => {
    if (!isClockEvent(event)) throw new Error(`evento desconocido: ${event.type}`);
    return clockReducer(state, event);
  }, base ?? initialClockState());
}

// Compactación: mismo contrato que el Aleatorio (umbral 200 / cola 20). La
// liquidación vive en el estado re-basado, así que no necesita cuidado extra.
export const CLOCK_COMPACT_THRESHOLD = 200;
export const CLOCK_COMPACT_KEEP = 20;

export function compactClockIfNeeded(input: { base: ClockState | null; log: PlayEvent[] }): {
  base: ClockState | null;
  log: PlayEvent[];
} {
  if (input.log.length <= CLOCK_COMPACT_THRESHOLD) return input;
  const cut = input.log.length - CLOCK_COMPACT_KEEP;
  return {
    base: replayClock(input.base, input.log.slice(0, cut)),
    log: input.log.slice(cut),
  };
}
