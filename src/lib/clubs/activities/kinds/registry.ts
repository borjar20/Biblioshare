import type { ActivityKind } from "@/lib/clubs/activities/core";
import type { ActivityKindDefinition } from "./types";
import { buddyReadKind } from "./buddy-read";
import { tierlistKind } from "./tierlist";
import { listChallengeKind } from "./list-challenge";
import { criteriaChallengeKind } from "./criteria-challenge";
import { eventoKind } from "./evento";

export const ACTIVITY_KINDS: Record<ActivityKind, ActivityKindDefinition> = {
  buddy_read: buddyReadKind,
  tierlist: tierlistKind,
  list_challenge: listChallengeKind,
  criteria_challenge: criteriaChallengeKind,
  evento: eventoKind,
};

export function getActivityKindDefinition(kind: ActivityKind): ActivityKindDefinition {
  return ACTIVITY_KINDS[kind];
}

export type { ActivityKindDefinition } from "./types";
export { visibleKindOptions } from "./types";
