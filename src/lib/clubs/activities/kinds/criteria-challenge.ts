import type { ActivityKindDefinition } from "./types";

// Stub -- Bloque H4 construye el comportamiento real (reutiliza el motor de
// conteo de src/lib/challenges, sin tablas nuevas).
export const criteriaChallengeKind: ActivityKindDefinition = {
  kind: "criteria_challenge",
  allowedItemTypes: "all",
  maxItems: null,
};
