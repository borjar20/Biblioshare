import type { ResourcesState } from "./types";

// Valor de (recurso, owner) o null si la combinación no existe. owner null =
// recurso compartido (banco).
export function valueOf(
  state: ResourcesState,
  resource: string,
  owner: string | null,
): number | null {
  const entry = state.values.find((v) => v.resource === resource && v.owner === owner);
  return entry ? entry.value : null;
}
