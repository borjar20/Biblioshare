import type { ActivityKind } from "@/lib/clubs/activities/core";
import type { ActivityKindDefinition } from "./types";
import { buddyReadKind } from "./buddy-read";
import { tierlistKind } from "./tierlist";
import { listChallengeKind } from "./list-challenge";
import { criteriaChallengeKind } from "./criteria-challenge";

export const ACTIVITY_KINDS: Record<ActivityKind, ActivityKindDefinition> = {
  buddy_read: buddyReadKind,
  tierlist: tierlistKind,
  list_challenge: listChallengeKind,
  criteria_challenge: criteriaChallengeKind,
};

export function getActivityKindDefinition(kind: ActivityKind): ActivityKindDefinition {
  return ACTIVITY_KINDS[kind];
}

export { ACTIVITY_KIND_ORDER } from "./types";
export type { ActivityKindDefinition } from "./types";
