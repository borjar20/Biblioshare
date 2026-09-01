// Estado del acompañante «Recursos» (spec recursos §1). Invariante de values:
// exactamente una entrada por def compartida (owner null) y una por (def no
// compartida × jugador) — los eventos que cambian players/defs RECONCILIAN.
export type ResourceDef = { name: string; emoji: string; initial: number; shared: boolean };
export type ResourceValue = { resource: string; owner: string | null; value: number };
export type ResourcesState = {
  players: string[];
  defs: ResourceDef[];
  values: ResourceValue[];
};

export function initialResourcesState(): ResourcesState {
  return { players: [], defs: [], values: [] };
}
