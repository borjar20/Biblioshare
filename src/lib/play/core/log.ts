import type { EventLog, PlayEvent } from "./types";

export const BURST_WINDOW_MS = 1500;

// El log committeado es INMUTABLE: solo append y pop del final (undo local
// pre-sync). Un evento con su id no cambia de significado después de existir —
// de esto depende la idempotencia de la sync de Fase 5 (spec §3).

const COALESCABLE = new Set(["life_changed", "poison_changed", "commander_damage"]);

// Clave de ráfaga: tipo + target (+ source en commander_damage). null = no coalescable.
function burstKey(event: PlayEvent): string | null {
  if (!COALESCABLE.has(event.type)) return null;
  const p = event.payload as { target: string; source?: string };
  return `${event.type}:${p.source ?? ""}:${p.target}`;
}

export function emptyLog(started: PlayEvent): EventLog {
  return { committed: [started], pending: null };
}

export function flushPending(log: EventLog): EventLog {
  if (!log.pending) return log;
  return { committed: [...log.committed, log.pending], pending: null };
}

export function append(log: EventLog, event: PlayEvent): EventLog {
  const sealed = flushPending(log);
  return { committed: [...sealed.committed, event], pending: null };
}

export function appendTap(log: EventLog, event: PlayEvent): EventLog {
  const key = burstKey(event);
  if (key === null) return append(log, event);
  const prev = log.pending;
  if (prev && burstKey(prev) === key) {
    const dt = event.at - prev.at;
    // dt < 0 = el reloj retrocedió: sellar, nunca mantener la ráfaga abierta (spec §3).
    if (dt >= 0 && dt <= BURST_WINDOW_MS) {
      const delta = (prev.payload as { delta: number }).delta + (event.payload as { delta: number }).delta;
      if (delta === 0) return { ...log, pending: null };
      return { ...log, pending: { ...prev, at: event.at, payload: { ...(prev.payload as object), delta } } };
    }
  }
  return { ...flushPending(log), pending: event };
}

export function undoLast(log: EventLog): { log: EventLog; undone: PlayEvent | null } {
  if (log.pending) return { log: { ...log, pending: null }, undone: log.pending };
  if (log.committed.length <= 1) return { log, undone: null }; // game_started se queda
  const undone = log.committed[log.committed.length - 1];
  return { log: { committed: log.committed.slice(0, -1), pending: null }, undone };
}
