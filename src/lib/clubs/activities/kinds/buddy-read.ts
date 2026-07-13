import { BuddyReadCheckpoints } from "@/components/clubs/checkpoints/buddy-read-checkpoints";
import type { ActivityKindDefinition } from "./types";

// EPIC-05 Bloque H1 -- primer kind real del motor de G. Un solo ítem
// (libro o serie; las películas no tienen sub-posición significativa que
// checkpointear, decisión 5 del diseño).
export const buddyReadKind: ActivityKindDefinition = {
  kind: "buddy_read",
  allowedItemTypes: ["book", "series"],
  maxItems: 1,
  DetailExtension: BuddyReadCheckpoints,
};
