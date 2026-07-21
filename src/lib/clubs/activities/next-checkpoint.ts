import type { ActivityCheckpointsView } from "./checkpoints";

type Checkpoint = ActivityCheckpointsView["checkpoints"][number];

// El «próximo hito» del rail (mockup PC, frame 1) es el primero que aún no has
// confirmado. Se deriva de la vista que el tablero ya carga: no hay dato nuevo.
// No se asume orden por estado -- se recorre en el orden en que llegan, que es
// el orden del hito.
export function nextCheckpoint(checkpoints: Checkpoint[]): Checkpoint | null {
  return checkpoints.find((c) => c.status !== "confirmed") ?? null;
}
