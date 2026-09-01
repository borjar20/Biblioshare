// Estado del acompañante «Turnos» (spec turnos §1). Los asientos (players y
// su color por posición) son FIJOS tras configurar; eliminated es un
// subconjunto que sale de la rotación sin perder el asiento.
export type TurnsState = {
  players: string[];
  eliminated: string[];
  phases: string[];
  active: number | null; // null = sin configurar
  phase: number;
  round: number;
  direction: 1 | -1;
};

export function initialTurnsState(): TurnsState {
  return {
    players: [],
    eliminated: [],
    phases: [],
    active: null,
    phase: 0,
    round: 1,
    direction: 1,
  };
}
