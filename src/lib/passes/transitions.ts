import type { MediaStatus } from "@/lib/library/types";

export type ActivePassSnapshot = { id: string; status: MediaStatus };

export type Transition =
  | { kind: "none" }
  | { kind: "createActive"; status: MediaStatus; startedOn: string | null; finishedOn: string | null; plannedOn: string | null }
  | { kind: "updateActive"; set: { status: MediaStatus; started_on?: string; finished_on?: string | null; planned_on?: string } }
  | { kind: "archiveAndCreate"; status: MediaStatus; startedOn: string | null; plannedOn: string | null }
  | { kind: "askResume" };

const OPEN: MediaStatus[] = ["planned", "in_progress"];

// La única fuente de verdad de los cambios de estado. TODA escritura de
// status pasa por aquí: ficha, formulario de sesión, auto-cierre. La hoja de
// cierre y la limpieza de cola las decide el ejecutor a partir del resultado.
export function planTransition(
  active: ActivePassSnapshot | null,
  to: MediaStatus,
  today: string,
  resume?: "continue" | "restart"
): Transition {
  if (!active) {
    // planned_on marca la entrada en la pila: solo se fija cuando el pase nace
    // (o pasa a) planned. Los que nacen leyendo/cerrados nunca pisaron la pila.
    if (to === "planned") return { kind: "createActive", status: to, startedOn: null, finishedOn: null, plannedOn: today };
    if (to === "in_progress") return { kind: "createActive", status: to, startedOn: today, finishedOn: null, plannedOn: null };
    // completed o dropped sin pase previo: nace ya cerrado (película vista).
    return { kind: "createActive", status: to, startedOn: today, finishedOn: today, plannedOn: null };
  }

  if (active.status === to) return { kind: "none" };

  if (OPEN.includes(active.status)) {
    if (to === "in_progress") return { kind: "updateActive", set: { status: to, started_on: today } };
    if (to === "planned") return { kind: "updateActive", set: { status: to, planned_on: today } };
    if (to === "completed" && active.status === "planned")
      return { kind: "updateActive", set: { status: to, started_on: today, finished_on: today } };
    return { kind: "updateActive", set: { status: to, finished_on: today } };
  }

  // Activo cerrado (completed | dropped).
  if (to === "planned") return { kind: "archiveAndCreate", status: to, startedOn: null, plannedOn: today };
  if (to === "in_progress") {
    if (active.status === "dropped") {
      if (!resume) return { kind: "askResume" };
      if (resume === "continue")
        return { kind: "updateActive", set: { status: to, finished_on: null } };
    }
    return { kind: "archiveAndCreate", status: to, startedOn: today, plannedOn: null };
  }
  // dropped → completed (o viceversa): corrección sobre el mismo pase.
  return { kind: "updateActive", set: { status: to, finished_on: today } };
}
