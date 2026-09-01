// Estado del acompañante «Reloj» (spec reloj §1). Los bancos están liquidados
// hasta lastEventAt: lo que falta hasta «ahora» lo añade el selector
// remainingAt — el reducer jamás mira el reloj del sistema.
export type ClockPlayer = { name: string; bankMs: number; flagged: boolean };

export type ClockState = {
  mode: "chess" | "countdown" | null; // null = sin configurar
  players: ClockPlayer[];
  active: number | null;
  incrementMs: number;
  initialMs: number;
  durationMs: number;
  countdownLeftMs: number;
  countdownRunning: boolean;
  paused: boolean;
  lastEventAt: number;
};

export function initialClockState(): ClockState {
  return {
    mode: null,
    players: [],
    active: null,
    incrementMs: 0,
    initialMs: 300_000,
    durationMs: 60_000,
    countdownLeftMs: 60_000,
    countdownRunning: false,
    paused: false,
    lastEventAt: 0,
  };
}
