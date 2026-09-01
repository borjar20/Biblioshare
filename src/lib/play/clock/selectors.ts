import type { ClockState } from "./types";

// Restante vivo a la hora `now`: banco liquidado menos lo corrido desde el
// último evento (solo si ese banco está corriendo). Con `player` = ajedrez;
// sin él = cuenta atrás (clavada en 0: nunca negativa).
export function remainingAt(state: ClockState, now: number, player?: number): number {
  const since = Math.max(0, now - state.lastEventAt);
  if (player !== undefined) {
    const p = state.players[player];
    if (!p || state.mode !== "chess") return 0;
    const running = state.active === player && !state.paused;
    return p.bankMs - (running ? since : 0);
  }
  if (state.mode !== "countdown") return 0;
  const running = state.countdownRunning && !state.paused;
  return Math.max(0, state.countdownLeftMs - (running ? since : 0));
}

// ¿Cruzó el cero a la hora `now`? En ajedrez la bandera liquidada persiste
// (spec: no se desfija salvo reconfigurar) y además se detecta EN VIVO para
// que la UI no espere al siguiente evento.
export function flaggedAt(state: ClockState, now: number, player?: number): boolean {
  if (player !== undefined) {
    if (state.mode !== "chess") return false;
    const p = state.players[player];
    if (!p) return false; // índice fuera de rango: sin bandera, no «caído»
    return p.flagged || remainingAt(state, now, player) <= 0;
  }
  return state.mode === "countdown" && remainingAt(state, now) <= 0;
}

// m:ss (o h:mm:ss desde 1 h), con signo − en negativo. El segundo en curso se
// trunca hacia abajo: 59.9 s restantes se leen 0:59.
export function formatMs(ms: number): string {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const core =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${m}:${String(sec).padStart(2, "0")}`;
  return neg ? `−${core}` : core;
}
